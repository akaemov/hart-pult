export type Freshness =
  | { state: "never" }
  | { state: "fresh" | "stale"; lastSuccessAt: Date; ageMinutes: number };

/// Свежи ли данные источника. «never» — ни одного успешного сбора:
/// это не то же самое, что устаревшие данные, и показывается по-другому.
export function classifyFreshness(
  lastSuccessAt: Date | null,
  maxAgeMinutes: number,
  now: Date,
): Freshness {
  if (!lastSuccessAt) return { state: "never" };
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - lastSuccessAt.getTime()) / 60_000));
  return {
    state: ageMinutes <= maxAgeMinutes ? "fresh" : "stale",
    lastSuccessAt,
    ageMinutes,
  };
}
