import Link from "next/link";
import { PERIODS, type Period } from "@/lib/period";

/// Период переключается сразу для всех окон вкладки — иначе на одном экране
/// окажутся цифры за разные отрезки, и сравнивать их будет нельзя.
export function PeriodSwitch({ current, basePath }: { current: Period; basePath: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-ink-3">Период:</span>
      <div className="flex gap-px bg-line">
        {PERIODS.map((days) => (
          <Link
            key={days}
            href={`${basePath}?days=${days}`}
            aria-current={days === current ? "page" : undefined}
            className={`px-3 py-1 font-mono text-xs ${
              days === current ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            {days} дней
          </Link>
        ))}
      </div>
    </div>
  );
}
