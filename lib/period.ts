/// Период на экране. Значения фиксированные: произвольный ввод в адресной
/// строке не должен превращаться в запрос за всю базу.
export const PERIODS = [7, 30, 90, 180] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = 90;

export function parsePeriod(value: string | string[] | undefined): Period {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return (PERIODS as readonly number[]).includes(days) ? (days as Period) : DEFAULT_PERIOD;
}

export function since(days: Period, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
