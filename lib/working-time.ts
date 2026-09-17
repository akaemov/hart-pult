import { TIME_ZONE } from "./format";

/// Рабочее время: только часы, когда отдел продаж на месте.
///
/// Календарная разница размывает картину: заявка в 21:40 и звонок в 09:10
/// выглядят как двенадцать часов молчания, хотя менеджер ответил за десять
/// минут работы. Считаем только минуты внутри окна — тогда медиана говорит
/// о работе отдела, а не о том, что ночью никто не звонит.
///
/// Выходные не исключаются: в недвижимости суббота и воскресенье — рабочие
/// дни, и офис продаж открыт.

export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 20;

const MINUTES_IN_DAY = 24 * 60;

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/// Сдвиг пояса объекта относительно UTC в минутах, на конкретный момент.
/// Считается через Intl, а не константой: перенос пояса или возврат летнего
/// времени тогда не потребует правок здесь.
function offsetMinutes(date: Date): number {
  const parts = offsetFormat.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/// Час суток по времени объекта.
export function localHour(date: Date): number {
  const minutes = date.getTime() / 60_000 + offsetMinutes(date);
  return Math.floor((((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY) / 60);
}

/// Внутри ли момент рабочего окна.
export function isWorkingHour(date: Date): boolean {
  const hour = localHour(date);
  return hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
}

/// Минуты рабочего времени между двумя моментами. Ночь и вечер выкидываются
/// целиком, поэтому результат всегда меньше календарной разницы.
export function workingMinutesBetween(from: Date, to: Date): number {
  if (to <= from) return 0;

  const offset = offsetMinutes(from);
  const localFrom = from.getTime() / 60_000 + offset;
  const localTo = to.getTime() / 60_000 + offset;

  let total = 0;
  const firstDay = Math.floor(localFrom / MINUTES_IN_DAY) * MINUTES_IN_DAY;

  for (let day = firstDay; day < localTo; day += MINUTES_IN_DAY) {
    const start = Math.max(localFrom, day + WORK_START_HOUR * 60);
    const end = Math.min(localTo, day + WORK_END_HOUR * 60);
    if (end > start) total += end - start;
  }

  return Math.round(total * 10) / 10;
}
