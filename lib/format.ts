/// Всё показывается по Москве, хранится в UTC.
const TIME_ZONE = "Europe/Moscow";

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
