/// Расчёты вкладки «Продажи»: остатки, цена метра, что не разбирают, брони
/// и темп продаж.
///
/// Всё считается здесь, без базы и без сети, и поэтому проверяется тестами.
/// Ни одна цифра не берётся у ИИ: в деньгах и метрах пульт обязан быть
/// воспроизводимым — два запуска на тех же данных дают тот же ответ.

export type SalesLot = {
  houseName: string;
  number: string;
  rooms: number | null;
  studio: boolean;
  areaTotal: number | null;
  status: string;
  price: number | null;
};

export type StockRow = {
  key: string;
  available: number;
  booked: number;
  sold: number;
  unavailable: number;
  /// Метры и деньги — только по свободным: это остаток, который предстоит продать.
  availableArea: number;
  availableValue: number;
  /// Доля проданного от того, что вообще выставлялось: снятые с продажи
  /// в знаменатель не идут — их не продавали и не пытались.
  soldShare: number | null;
};

export const SOLD = "SOLD";
export const AVAILABLE = "AVAILABLE";
export const BOOKED = "BOOKED";

/// Комнатность в словах отдела продаж. Студия у Profitbase помечена отдельно,
/// а комнат у неё стоит одна — без этого она сливается с однушкой.
export function roomsLabel(lot: Pick<SalesLot, "rooms" | "studio">): string {
  if (lot.studio) return "Студия";
  if (lot.rooms === null) return "Без комнатности";
  return `${lot.rooms}-комн.`;
}

/// Порядок для разрезов по комнатности: студии первыми, дальше по возрастанию.
export function roomsOrder(label: string): number {
  if (label === "Студия") return 0;
  const match = /^(\d+)/.exec(label);
  return match ? Number(match[1]) : 99;
}

export function groupStock(lots: SalesLot[], by: (lot: SalesLot) => string): StockRow[] {
  const groups = new Map<string, SalesLot[]>();
  for (const lot of lots) {
    const key = by(lot);
    const bucket = groups.get(key);
    if (bucket) bucket.push(lot);
    else groups.set(key, [lot]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const available = group.filter((lot) => lot.status === AVAILABLE);
    const sold = group.filter((lot) => lot.status === SOLD).length;
    const booked = group.filter((lot) => lot.status === BOOKED).length;
    const offered = sold + booked + available.length;

    return {
      key,
      available: available.length,
      booked,
      sold,
      unavailable: group.length - sold - booked - available.length,
      availableArea: round(available.reduce((sum, lot) => sum + (lot.areaTotal ?? 0), 0)),
      availableValue: available.reduce((sum, lot) => sum + (lot.price ?? 0), 0),
      soldShare: offered === 0 ? null : sold / offered,
    };
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/// Цена метра по свободным лотам: сумма цен, делённая на сумму площадей.
/// Не среднее из цен за метр по каждой квартире — так большая квартира весит
/// больше маленькой, и это правильно: столько стоит остаток.
export function pricePerMeter(lots: SalesLot[]): number | null {
  const available = lots.filter((lot) => lot.status === AVAILABLE && lot.areaTotal && lot.price);
  const area = available.reduce((sum, lot) => sum + (lot.areaTotal ?? 0), 0);
  if (area === 0) return null;
  const value = available.reduce((sum, lot) => sum + (lot.price ?? 0), 0);
  return Math.round(value / area);
}

export type SlowMover = {
  key: string;
  soldShare: number;
  /// Насколько отстаёт от объекта в целом, в процентных пунктах.
  behind: number;
  available: number;
  availableValue: number;
};

/// Что не разбирают: группы, которые продаются заметно хуже объекта в целом
/// и при этом ещё лежат в остатке.
///
/// Пороги заданы здесь, а не разбросаны по странице: отставание меньше десяти
/// процентных пунктов — это шум выборки, а остаток меньше пяти квартир не
/// стоит разговора с отделом продаж.
export const LAG_POINTS = 0.1;
export const MIN_REMAINDER = 5;

export function slowMovers(rows: StockRow[], overallShare: number | null): SlowMover[] {
  if (overallShare === null) return [];

  return rows
    .filter((row) => row.soldShare !== null && row.available >= MIN_REMAINDER)
    .map((row) => ({
      key: row.key,
      soldShare: row.soldShare!,
      behind: overallShare - row.soldShare!,
      available: row.available,
      availableValue: row.availableValue,
    }))
    .filter((row) => row.behind >= LAG_POINTS)
    .sort((a, b) => b.behind - a.behind);
}

export type ClosedDeal = { closedAt: Date; price: number | null; object: string };

export type MonthSales = { month: string; deals: number; value: number };

/// Темп продаж по закрытым сделкам amoCRM: штуки и рубли по месяцам.
///
/// Считается по дате закрытия, а не создания: сделка, заведённая в марте
/// и закрытая в сентябре, — это сентябрьская продажа. По дате создания она
/// попала бы в март и исказила оба месяца сразу.
export function salesByMonth(deals: ClosedDeal[], monthKey: (date: Date) => string): MonthSales[] {
  const months = new Map<string, MonthSales>();

  for (const deal of deals) {
    const key = monthKey(deal.closedAt);
    const row = months.get(key) ?? { month: key, deals: 0, value: 0 };
    row.deals++;
    row.value += deal.price ?? 0;
    months.set(key, row);
  }

  return [...months.values()];
}
