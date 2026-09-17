import Link from "next/link";
import { formatMinutes } from "@/lib/format";
import type { ManagerComparisonRow } from "@/lib/processing";

/// Сравнение менеджеров за закрытый календарный месяц.
///
/// Дельта показывается рядом с числом и окрашена по смыслу, а не по знаку:
/// у медианы «минус» — это хорошо, у доли быстрых ответов — плохо.

function Delta({
  value,
  unit,
  lowerIsBetter = false,
  format,
}: {
  value: number | null;
  unit: string;
  lowerIsBetter?: boolean;
  format?: (value: number) => string;
}) {
  if (value === null) return <span className="text-ink-3">—</span>;
  if (Math.abs(value) < 0.05) return <span className="text-ink-3">без изменений</span>;

  const better = lowerIsBetter ? value < 0 : value > 0;
  const shown = format ? format(Math.abs(value)) : `${Math.abs(value)}${unit}`;
  return (
    <span className={better ? "text-ok" : "text-crit"}>
      {value > 0 ? "+" : "−"}
      {shown}
    </span>
  );
}

function Share({ value }: { value: number | null }) {
  return <>{value === null ? "—" : `${value}%`}</>;
}

export function ManagerComparison({
  rows,
  currentLabel,
  previousLabel,
  linkPeriodDays,
}: {
  rows: ManagerComparisonRow[];
  currentLabel: string;
  previousLabel: string;
  linkPeriodDays: number;
}) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
            <th className="px-3 py-2 font-medium">Менеджер</th>
            <th className="px-3 py-2 text-right font-medium">Сделок</th>
            <th className="px-3 py-2 text-right font-medium">Дошли до звонка</th>
            <th className="px-3 py-2 text-right font-medium">Быстрее 30 мин</th>
            <th className="px-3 py-2 text-right font-medium">Медиана ответа</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-line align-top last:border-b-0">
              <td className="px-3 py-2">
                <Link
                  href={`/processing/leads?days=${linkPeriodDays}&manager=${encodeURIComponent(row.name)}`}
                  className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                >
                  {row.name}
                </Link>
                {!row.current && (
                  <span className="block text-xs text-ink-3" title={currentLabel}>
                    сделок в этом месяце не было
                  </span>
                )}
                {!row.previous && (
                  <span className="block text-xs text-ink-3" title={previousLabel}>
                    месяцем раньше сделок не было
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <span className="block">{row.current?.total ?? "—"}</span>
                <span className="block text-xs">
                  <Delta value={row.totalDelta} unit="" />
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <span className="block">
                  <Share value={row.current?.answeredShare ?? null} />
                </span>
                <span className="block text-xs">
                  <Delta value={row.answeredShareDelta} unit=" п.п." />
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <span className="block">
                  <Share value={row.current?.fastShare ?? null} />
                </span>
                <span className="block text-xs">
                  <Delta value={row.fastShareDelta} unit=" п.п." />
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <span className="block">{formatMinutes(row.current?.medianMinutes ?? null)}</span>
                <span className="block text-xs">
                  <Delta
                    value={row.medianDelta}
                    unit=""
                    lowerIsBetter
                    format={(value) => formatMinutes(value)}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
