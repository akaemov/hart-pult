/// Чистые функции для диагностики. Вынесены отдельно, чтобы их можно было
/// проверить тестами без обращения к amoCRM.

/// Медиана. Для чётной длины — среднее двух серединных значений.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/// Доля в процентах с одним знаком. Знаменатель 0 даёт null, а не NaN:
/// «нет данных» и «ноль процентов» — разные утверждения.
export function share(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/// Минуты между двумя метками времени в секундах (unix).
export function minutesBetween(fromSec: number, toSec: number): number {
  return Math.round(((toSec - fromSec) / 60) * 10) / 10;
}

/// Человекочитаемая длительность: минуты, часы или дни.
export function humanMinutes(minutes: number | null): string {
  if (minutes === null) return "нет данных";
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ч ${Math.round(minutes - hours * 60)} мин`;
  }
  const days = Math.floor(minutes / (60 * 24));
  return `${days} дн ${Math.round((minutes - days * 60 * 24) / 60)} ч`;
}
