import { FreshnessBadge } from "@/components/freshness-badge";
import { PultHeader } from "@/components/pult-header";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { classifyFreshness } from "@/lib/sync/freshness";
import { SOURCES } from "@/lib/sync/sources";

export default async function OverviewPage() {
  const user = await requireUser();

  const [successes, latestRuns] = await Promise.all([
    prisma.syncRun.groupBy({
      by: ["source"],
      where: { status: "SUCCESS" },
      _max: { finishedAt: true },
    }),
    prisma.syncRun.findMany({
      distinct: ["source"],
      orderBy: [{ source: "asc" }, { startedAt: "desc" }],
      select: { source: true, status: true, error: true, startedAt: true },
    }),
  ]);

  const lastSuccess = new Map(successes.map((s) => [s.source, s._max.finishedAt]));
  const lastRun = new Map(latestRuns.map((r) => [r.source, r]));
  const now = new Date();

  return (
    <>
      <PultHeader user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <section className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Обзор</h1>
          <p className="max-w-[62ch] text-ink-2">
            Показатели появятся здесь по мере подключения источников. Первым идёт amoCRM —
            блок обработки обращений.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
            <h2 className="font-semibold">Состояние источников</h2>
            <span className="font-mono text-xs text-ink-3">время — МСК</span>
          </div>
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  <th className="px-4 py-2.5 font-medium">Источник</th>
                  <th className="px-4 py-2.5 font-medium">Что даёт пульту</th>
                  <th className="px-4 py-2.5 font-medium">Данные</th>
                  <th className="px-4 py-2.5 font-medium">Последний прогон</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((source) => {
                  const freshness = classifyFreshness(
                    lastSuccess.get(source.id) ?? null,
                    source.maxAgeMinutes,
                    now,
                  );
                  const run = lastRun.get(source.id);
                  return (
                    <tr key={source.id} className="border-b border-line last:border-b-0 align-top">
                      <td className="px-4 py-3 font-medium">{source.label}</td>
                      <td className="px-4 py-3 text-ink-2">{source.feeds}</td>
                      <td className="px-4 py-3">
                        <FreshnessBadge freshness={freshness} />
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {!run && <span className="text-ink-3">—</span>}
                        {run?.status === "RUNNING" && <>идёт с {formatDateTime(run.startedAt)}</>}
                        {run?.status === "SUCCESS" && <>успешно, {formatDateTime(run.startedAt)}</>}
                        {run?.status === "FAILED" && (
                          <span className="text-crit" title={run.error ?? undefined}>
                            ошибка, {formatDateTime(run.startedAt)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
