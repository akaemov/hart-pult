import "server-only";
import { detectObject, OBJECTS, type ObjectName } from "../channels";
import { prisma } from "../prisma";
import {
  AVAILABLE,
  BOOKED,
  groupStock,
  isFlat,
  pricePerMeter,
  roomsLabel,
  roomsOrder,
  salesByMonth,
  slowMovers,
  type MonthSales,
  type SalesLot,
  type SlowMover,
  type StockRow,
} from "../sales";
import { isFeedCopy, normalizeHouse, normalizeProject } from "../stock-pairs";
import { monthKey } from "./leads-by-channel";

/// Вкладка «Продажи»: остатки из Profitbase и темп продаж из amoCRM.
///
/// Два источника не смешиваются в одной цифре. Остатки — это состояние стока,
/// их ведёт отдел продаж в Profitbase. Темп — это закрытые сделки amoCRM,
/// и объект у сделки определяется по названию и меткам, а не по полю «ЖК»:
/// оно заполнено у 4% сделок. Поэтому у темпа всегда есть строка
/// «объект не определён», а у остатков её быть не может.

/// Объекты, у которых есть сток. Список не зашит: третий объект появится
/// в Profitbase — окно возникнет само, а пустых окон по объектам, которых
/// в стоке нет, не будет.
const NAMED_OBJECTS = OBJECTS.filter((object) => object !== "Не определён");

export type ObjectSales = {
  object: ObjectName;
  lots: number;
  available: number;
  booked: number;
  sold: number;
  /// Снятые с продажи: в долю проданного они не идут, но в стоке лежат,
  /// и без них не сходится общее число квартир.
  unavailable: number;
  /// Метры и деньги остатка.
  availableArea: number;
  availableValue: number;
  soldShare: number | null;
  pricePerMeter: number | null;
  bySection: StockRow[];
  byRooms: StockRow[];
  slow: SlowMover[];
  /// Цена метра по комнатности: где-то метр дороже, и видно, за счёт чего.
  meterByRooms: { key: string; value: number | null }[];
};

export type SalesReport = {
  objects: ObjectSales[];
  months: string[];
  /// Темп продаж по месяцам: объект → месяц → штуки и рубли.
  pace: Map<ObjectName, Map<string, MonthSales>>;
  paceTotals: Map<ObjectName, MonthSales>;
  /// Сколько сделок закрыто успешно, но без суммы: такие видны в штуках
  /// и не видны в рублях.
  dealsWithoutPrice: number;
  /// Сколько дней уже копится история остатков. Ноль — снимков ещё нет.
  historyDays: number;
};

/// Системный статус amoCRM «успешно реализовано».
const WON = 142;

/// Глубина темпа продаж: год закрытых сделок.
const PACE_MONTHS = 12;

function objectOfProject(projectName: string): ObjectName | null {
  if (isFeedCopy(projectName)) return null;
  const key = normalizeProject(projectName);
  return NAMED_OBJECTS.find((object) => key.includes(normalizeProject(object))) ?? null;
}

export async function salesReport(now = new Date()): Promise<SalesReport> {
  const from = new Date(now);
  from.setMonth(from.getMonth() - (PACE_MONTHS - 1));

  const [lots, deals, days] = await Promise.all([
    prisma.property.findMany({
      select: {
        projectName: true,
        houseName: true,
        number: true,
        rooms: true,
        studio: true,
        areaTotal: true,
        status: true,
        price: true,
      },
    }),
    prisma.lead.findMany({
      where: { statusId: WON, closedAt: { not: null, gte: from } },
      select: {
        name: true,
        price: true,
        closedAt: true,
        sourceLabel: true,
        objectLabel: true,
        utmSource: true,
        utmCampaign: true,
        referrer: true,
      },
    }),
    prisma.stockDaily.findMany({ select: { day: true }, distinct: ["day"] }),
  ]);

  const withStock = NAMED_OBJECTS.filter((object) =>
    lots.some((lot) => objectOfProject(lot.projectName) === object),
  );

  const objects = withStock.map((object) => {
    const mine: SalesLot[] = lots
      .filter((lot) => objectOfProject(lot.projectName) === object)
      .map((lot) => ({
        houseName: normalizeHouse(lot.houseName),
        number: lot.number,
        rooms: lot.rooms,
        studio: lot.studio,
        areaTotal: lot.areaTotal,
        status: lot.status,
        price: lot.price,
      }));

    const flats = mine.filter((lot) => isFlat(lot.houseName));

    const [total] = groupStock(flats, () => "всего");
    const bySection = groupStock(flats, (lot) => lot.houseName).sort((a, b) =>
      a.key.localeCompare(b.key, "ru"),
    );
    const byRooms = groupStock(flats, roomsLabel).sort(
      (a, b) => roomsOrder(a.key) - roomsOrder(b.key),
    );

    return {
      object,
      lots: flats.length,
      available: total?.available ?? 0,
      booked: total?.booked ?? 0,
      sold: total?.sold ?? 0,
      unavailable: total?.unavailable ?? 0,
      availableArea: total?.availableArea ?? 0,
      availableValue: total?.availableValue ?? 0,
      soldShare: total?.soldShare ?? null,
      pricePerMeter: pricePerMeter(flats),
      bySection,
      byRooms,
      slow: slowMovers(byRooms, total?.soldShare ?? null),
      meterByRooms: byRooms.map((row) => ({
        key: row.key,
        value: pricePerMeter(flats.filter((lot) => roomsLabel(lot) === row.key)),
      })),
    } satisfies ObjectSales;
  });

  const byObject = new Map<ObjectName, { closedAt: Date; price: number | null; object: string }[]>();
  for (const deal of deals) {
    const object = detectObject(deal);
    const bucket = byObject.get(object) ?? [];
    bucket.push({ closedAt: deal.closedAt!, price: deal.price, object });
    byObject.set(object, bucket);
  }

  const months = new Set<string>();
  const pace = new Map<ObjectName, Map<string, MonthSales>>();
  const paceTotals = new Map<ObjectName, MonthSales>();

  for (const [object, list] of byObject) {
    const rows = salesByMonth(list, monthKey);
    pace.set(object, new Map(rows.map((row) => [row.month, row])));
    paceTotals.set(object, {
      month: "всего",
      deals: rows.reduce((sum, row) => sum + row.deals, 0),
      value: rows.reduce((sum, row) => sum + row.value, 0),
    });
    for (const row of rows) months.add(row.month);
  }

  return {
    objects,
    months: [...months].sort(),
    pace,
    paceTotals,
    dealsWithoutPrice: deals.filter((deal) => !deal.price).length,
    historyDays: days.length,
  };
}

export { AVAILABLE, BOOKED };
