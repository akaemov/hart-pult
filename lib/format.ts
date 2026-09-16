/// Всё показывается по времени объекта, хранится в UTC.
///
/// В ТЗ стояла Москва, но офис продаж и покупатели живут в Екатеринбурге:
/// «ответили за 15 минут» и «дыры в графике» имеют смысл только в местных
/// часах. Меняется одной строкой, если объект окажется в другом поясе.
export const TIME_ZONE = "Asia/Yekaterinburg";

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const time = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

export function formatTime(date: Date): string {
  return time.format(date);
}

/// Возраст данных. Сокращения вместо слов, чтобы не склонять «минута/минуты/минут».
export function formatAge(minutes: number): string {
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}

const hourFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

/// Час суток по времени объекта. Считается через Intl, а не сдвигом на
/// константу: переход на летнее время и смена пояса тогда не соврут.
export function hourOfDay(date: Date): number {
  return Number(hourFormat.format(date));
}

/// Длительность в минутах человеческим текстом.
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${Math.round(minutes - hours * 60)} мин`;
  const days = Math.floor(hours / 24);
  return `${days} дн ${hours - days * 24} ч`;
}
