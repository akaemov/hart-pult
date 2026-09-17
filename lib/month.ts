import { TIME_ZONE } from "./format";

/// Границы календарных месяцев по времени объекта.
///
/// Месяц берётся прошлый, а не текущий: незакрытый месяц сравнивать не с чем —
/// в нём прошло разное число дней, и любой вывод о менеджере будет о календаре,
/// а не о работе.

export type MonthRange = { from: Date; to: Date; label: string };

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const monthName = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TIME_ZONE,
  month: "long",
  year: "numeric",
});

/// Сдвиг пояса объекта в минутах. Россия живёт без перевода часов, но
/// считаем через Intl, чтобы не зашивать константу.
function offsetMinutes(date: Date): number {
  const map = new Map(parts.formatToParts(date).map((part) => [part.type, Number(part.value)]));
  const asUtc = Date.UTC(
    map.get("year")!,
    map.get("month")! - 1,
    map.get("day")!,
    map.get("hour")! === 24 ? 0 : map.get("hour")!,
    map.get("minute")!,
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/// Начало месяца по местному времени, выраженное моментом в UTC.
function localMonthStart(year: number, month: number, reference: Date): Date {
  const naive = Date.UTC(year, month, 1, 0, 0);
  return new Date(naive - offsetMinutes(reference) * 60_000);
}

/// Месяц со сдвигом назад: 1 — прошлый, 2 — позапрошлый.
export function monthsAgo(shift: number, now = new Date()): MonthRange {
  const map = new Map(parts.formatToParts(now).map((part) => [part.type, Number(part.value)]));
  const year = map.get("year")!;
  const month = map.get("month")! - 1;

  const from = localMonthStart(year, month - shift, now);
  const to = localMonthStart(year, month - shift + 1, now);

  return { from, to, label: monthName.format(from).replace(" г.", "") };
}
