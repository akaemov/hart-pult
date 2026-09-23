import { localDay } from "../month";
import { pbGet } from "../profitbase";
import { prisma } from "../prisma";
import { isFeedCopy, normalizeProject } from "../stock-pairs";
import { withRetry } from "./retry";
import type { Collector, SyncContext } from "./run";

/// Сбор остатков из Profitbase: статусы, цены и площади всех лотов.
///
/// Берётся весь сток целиком, включая проекты-копии «ДЛЯ АВИТО». Копии нужны
/// не сами по себе: фид Авито кормится из них, и разошедшийся статус копии
/// с основным проектом — это квартира, которую продали, а объявление осталось.
///
/// Период не нужен: Profitbase отдаёт состояние на сейчас, истории статусов
/// в API нет — поэтому историю пульт копит сам. Каждый прогон сравнивает
/// пришедшее с тем, что лежит в базе, и записывает смены статуса; раз в день
/// остаётся срез остатков. Без этого «темп продаж» виден только по сделкам
/// amoCRM, а брони и снятия с продажи не видны вовсе.

const PAGE = 200;
const CHUNK = 100;
const TX = { timeout: 180_000, maxWait: 120_000 };

type PbProperty = {
  id: number;
  projectId: number;
  projectName?: string;
  house_id?: number;
  houseName?: string;
  number?: string | number;
  floor?: number;
  rooms_amount?: number;
  studio?: boolean;
  status?: string;
  area?: { area_total?: number; area_living?: number };
  price?: { value?: number };
};

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Row = {
  id: number;
  projectName: string;
  houseName: string;
  number: string;
  rooms: number | null;
  studio: boolean;
  areaTotal: number | null;
  status: string;
  price: number | null;
};

/// Объект, как его зовут в компании. Копии «ДЛЯ АВИТО» в историю не идут:
/// продажи отмечаются в основных проектах, и считать их дважды нельзя.
function objectOf(projectName: string): string | null {
  if (isFeedCopy(projectName)) return null;
  const key = normalizeProject(projectName);
  if (key.includes("заря")) return "Заря";
  if (key.includes("пьермонт")) return "Пьермонт";
  return null;
}

async function recordChanges(rows: Row[], before: Map<number, string>) {
  const changes = rows
    .filter((row) => {
      const was = before.get(row.id);
      // Новый лот сменой статуса не считается: он не «стал проданным»,
      // его просто завели.
      return was !== undefined && was !== row.status;
    })
    .map((row) => ({
      propertyId: row.id,
      object: objectOf(row.projectName),
      houseName: row.houseName,
      number: row.number,
      rooms: row.rooms,
      areaTotal: row.areaTotal,
      price: row.price,
      fromStatus: before.get(row.id)!,
      toStatus: row.status,
    }))
    .filter((change): change is typeof change & { object: string } => change.object !== null);

  if (changes.length > 0) await prisma.stockChange.createMany({ data: changes });
}

async function recordDaily(rows: Row[], now = new Date()) {
  const day = localDay(now);
  const objects = new Map<string, Row[]>();

  for (const row of rows) {
    const object = objectOf(row.projectName);
    if (!object) continue;
    (objects.get(object) ?? objects.set(object, []).get(object)!).push(row);
  }

  for (const [object, lots] of objects) {
    const available = lots.filter((lot) => lot.status === "AVAILABLE");
    const data = {
      available: available.length,
      booked: lots.filter((lot) => lot.status === "BOOKED").length,
      sold: lots.filter((lot) => lot.status === "SOLD").length,
      unavailable: lots.filter((lot) => lot.status === "UNAVAILABLE").length,
      availableArea: available.reduce((sum, lot) => sum + (lot.areaTotal ?? 0), 0),
      availableValue: available.reduce((sum, lot) => sum + (lot.price ?? 0), 0),
    };

    // Срез за день перезаписывается: прогонов в день несколько, а день один,
    // и в нём должно остаться последнее известное состояние.
    await prisma.stockDaily.upsert({
      where: { day_object: { day, object } },
      create: { day, object, ...data },
      update: data,
    });
  }
}

export function inventoryCollector(): Collector {
  return async (ctx: SyncContext) => {
    const all: PbProperty[] = [];

    for (let offset = 0; ; offset += PAGE) {
      const body = await pbGet<{ data?: PbProperty[] }>("/property", { limit: PAGE, offset });
      const chunk = body.data ?? [];
      all.push(...chunk);
      if (chunk.length < PAGE) break;
    }

    await ctx.saveRaw("property", { count: all.length });

    const before = new Map(
      (await prisma.property.findMany({ select: { id: true, status: true } })).map((lot) => [
        lot.id,
        lot.status,
      ]),
    );

    const rows = all.map((property) => ({
      id: property.id,
      projectId: property.projectId,
      projectName: property.projectName ?? "",
      houseId: property.house_id ?? null,
      houseName: property.houseName ?? "",
      number: String(property.number ?? ""),
      floor: property.floor ?? null,
      rooms: property.rooms_amount ?? null,
      studio: property.studio ?? false,
      areaTotal: property.area?.area_total ?? null,
      areaLiving: property.area?.area_living ?? null,
      status: property.status ?? "",
      price: property.price?.value ?? null,
    }));

    for (const batch of chunked(rows)) {
      await withRetry("запись лотов", () =>
        prisma.$transaction(
          batch.map((data) =>
            prisma.property.upsert({ where: { id: data.id }, create: data, update: data }),
          ),
          TX,
        ),
      );
    }

    // Лот, убранный из Profitbase, не должен остаться в пульте: остатки — срез
    // на сейчас, и вчерашняя квартира в нём только путает.
    await prisma.property.deleteMany({ where: { id: { notIn: rows.map((row) => row.id) } } });

    await recordChanges(rows, before);
    await recordDaily(rows);

    return { rows: rows.length };
  };
}
