import Link from "next/link";
import { notFound } from "next/navigation";
import { PeriodSwitch } from "@/components/period-switch";
import { PultHeader } from "@/components/pult-header";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime, formatMinutes, TIME_ZONE_LABEL } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { FreshnessBadge } from "@/components/freshness-badge";
import { amoReport } from "@/lib/sync/source-report";
import { sourceById } from "@/lib/sync/sources";
import { freshnessOf } from "@/lib/sync/status";
import type { Severity } from "@/lib/sync/problems";

const SEVERITY_STYLES: Record<Severity, { chip: string; label: string }> = {
  crit: { chip: "bg-crit-soft text-crit", label: "мешает считать" },
  warn: { chip: "bg-warn-soft text-warn", label: "искажает" },
  info: { chip: "bg-surface-2 text-ink-2", label: "к сведению" },
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface-2 px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">{label}</span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      {note && <span className="text-xs text-ink-3">{note}</span>}
    </div>
  );
}

export default async function SourcePage(props: PageProps<"/sources/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const params = await props.searchParams;
  const days = parsePeriod(params.days);

  const source = sourceById(id);
  if (!source) notFound();

  const now = new Date();
  const [freshness, runs] = await Promise.all([
    freshnessOf(source.id, now),
    prisma.syncRun.findMany({
      where: { source: source.id },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        rowsFetched: true,
        error: true,
      },
    }),
  ]);

  const connected = source.needs.length === 0;
  const report = connected && source.id === "amocrm" ? await amoReport(days, now) : null;
  const share = (part: number, total: number) =>
    total === 0 ? "—" : `${Math.round((part / total) * 1000) / 10}%`;

  return (
    <>
      <PultHeader user={user} active="/" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-2">
          <Link href="/" className="text-sm text-ink-2 hover:text-ink">
            ← Состояние источников
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{source.label}</h1>
                <FreshnessBadge freshness={freshness} />
                <span className="chip bg-surface-2 text-ink-2">{source.phase}</span>
              </div>
              <p className="max-w-[62ch] text-sm text-ink-2">
                Даёт пульту: {source.feeds}. Время — {TIME_ZONE_LABEL}.
              </p>
            </div>
            {report && <PeriodSwitch current={days} basePath={`/sources/${source.id}`} />}
          </div>
        </div>

        {report && (
          <section className="flex flex-col gap-4 border border-line bg-surface">
            <header className="border-b border-line px-4 py-3">
              <h2 className="font-semibold tracking-tight">Что собрано за {days} дней</h2>
            </header>
            <div className="grid gap-px bg-line px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Сделок" value={String(report.metrics.leads)} />
              <Stat
                label="С источником"
                value={share(report.metrics.withSource, report.metrics.leads)}
                note={`${report.metrics.withSource} сделок`}
              />
              <Stat
                label="Дошли до звонка"
                value={share(report.metrics.withCall, report.metrics.leads)}
                note={`${report.metrics.withCall} сделок`}
              />
              <Stat
                label="Медиана ответа"
                value={formatMinutes(report.metrics.medianReplyMin)}
              />
            </div>
          </section>
        )}

        {report && (
          <section className="flex flex-col border border-line bg-surface">
            <header className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3">
              <h2 className="font-semibold tracking-tight">Дыры и проблемы</h2>
              <span className="text-xs text-ink-3">
                {report.problems.length === 0
                  ? "не найдено"
                  : `найдено: ${report.problems.length}`}
              </span>
            </header>
            {report.problems.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-2">
                Пороги качества пройдены: источник заполнен, обращения обрабатываются,
                очереди нет.
              </p>
            ) : (
              <ul className="flex flex-col">
                {report.problems.map((problem) => (
                  <li
                    key={problem.title}
                    className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span className="flex flex-wrap items-center gap-2.5">
                      <span className={`chip ${SEVERITY_STYLES[problem.severity].chip}`}>
                        {SEVERITY_STYLES[problem.severity].label}
                      </span>
                      <span className="font-medium">{problem.title}</span>
                    </span>
                    <span className="text-sm text-ink-2">{problem.detail}</span>
                    <span className="text-sm text-ink-3">→ {problem.action}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {report && report.providers.length > 0 && (
          <section className="flex flex-col border border-line bg-surface">
            <header className="border-b border-line px-4 py-3">
              <h2 className="font-semibold tracking-tight">Через что звонят</h2>
            </header>
            <ul className="flex flex-col">
              {report.providers.map((provider) => (
                <li
                  key={provider.name}
                  className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span>{provider.name}</span>
                  <span className="font-mono tabular-nums text-ink-2">
                    {provider.calls} · {share(provider.calls, report.metrics.callsTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!connected && (
          <section className="grid gap-px border border-line bg-line md:grid-cols-2">
            <div className="flex flex-col gap-3 bg-surface px-4 py-4">
              <h2 className="font-semibold tracking-tight">Что нужно для подключения</h2>
              <ul className="flex flex-col gap-2 text-sm text-ink-2">
                {source.needs.map((need) => (
                  <li key={need} className="flex gap-2">
                    <span className="text-ink-3">—</span>
                    {need}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3 bg-surface px-4 py-4">
              <h2 className="font-semibold tracking-tight">Что появится</h2>
              <ul className="flex flex-col gap-2 text-sm text-ink-2">
                {source.shows.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-ink-3">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="flex flex-col border border-line bg-surface">
          <header className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3">
            <h2 className="font-semibold tracking-tight">Прогоны сбора</h2>
            <span className="text-xs text-ink-3">последние {runs.length || "—"}</span>
          </header>
          {runs.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink-2">
              Сбор по этому источнику ещё ни разу не запускался.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                    <th className="px-4 py-2 font-medium">Начат</th>
                    <th className="px-4 py-2 font-medium">Итог</th>
                    <th className="px-4 py-2 text-right font-medium">Строк</th>
                    <th className="px-4 py-2 text-right font-medium">Длился</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b border-line last:border-b-0 align-top">
                      <td className="px-4 py-2 text-ink-2">{formatDateTime(run.startedAt)}</td>
                      <td className="px-4 py-2">
                        {run.status === "SUCCESS" && <span className="text-ok">успешно</span>}
                        {run.status === "RUNNING" && <span className="text-ink-2">идёт</span>}
                        {run.status === "FAILED" && (
                          <span className="text-crit">
                            ошибка
                            {run.error && (
                              <span className="block max-w-[46ch] text-xs text-ink-3">
                                {run.error.split("\n")[0].slice(0, 120)}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-ink-2">
                        {run.rowsFetched ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-ink-2">
                        {run.finishedAt
                          ? `${Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)} с`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
