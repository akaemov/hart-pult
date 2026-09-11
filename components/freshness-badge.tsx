import type { Freshness } from "@/lib/sync/freshness";
import { formatAge, formatDateTime } from "@/lib/format";

/// Отметка свежести — обязательна на каждом окне пульта (правило 2 из ТЗ).
export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  if (freshness.state === "never") {
    return <span className="chip bg-surface-2 text-ink-3">не подключён</span>;
  }

  const stale = freshness.state === "stale";
  return (
    <span
      className={`chip ${stale ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}
      title={`Последний успешный сбор: ${formatDateTime(freshness.lastSuccessAt)} МСК`}
    >
      {stale ? "устарели · " : ""}
      {formatAge(freshness.ageMinutes)}
    </span>
  );
}
