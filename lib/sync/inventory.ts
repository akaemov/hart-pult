import { pbGet } from "../profitbase";
import { prisma } from "../prisma";
import { withRetry } from "./retry";
import type { Collector, SyncContext } from "./run";

/// Сбор остатков из Profitbase: статусы, цены и площади всех лотов.
///
/// Берётся весь сток целиком, включая проекты-копии «ДЛЯ АВИТО». Копии нужны
/// не сами по себе: фид Авито кормится из них, и разошедшийся статус копии
/// с основным проектом — это квартира, которую продали, а объявление осталось.
///
/// Период не нужен: Profitbase отдаёт состояние на сейчас, истории статусов
/// в API нет.

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
  status?: string;
  area?: { area_total?: number; area_living?: number };
  price?: { value?: number };
};

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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

    const rows = all.map((property) => ({
      id: property.id,
      projectId: property.projectId,
      projectName: property.projectName ?? "",
      houseId: property.house_id ?? null,
      houseName: property.houseName ?? "",
      number: String(property.number ?? ""),
      floor: property.floor ?? null,
      rooms: property.rooms_amount ?? null,
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

    return { rows: rows.length };
  };
}
