import Link from "next/link";
import { GradeLegend } from "@/components/grade-legend";
import { PeriodSwitch } from "@/components/period-switch";
import { PultHeader } from "@/components/pult-header";
import { PultWindow } from "@/components/pult-window";
import { requireUser } from "@/lib/auth/dal";
import { buildFunnel, buildManagerFunnels, type StageInput } from "@/lib/funnel";
import { parsePeriod, since } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { freshnessOf } from "@/lib/sync/status";

export default async function FunnelPage(props: PageProps<"/funnel">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const days = parsePeriod(params.days);
  const now = new Date();

  const [pipelines, freshness] = await Promise.all([
    prisma.pipeline.findMany({
      orderBy: [{ isMain: "desc" }, { sort: "asc" }],
      select: {
        id: true,
        name: true,
        statuses: {
          orderBy: { sort: "asc" },
          select: { id: true, name: true, sort: true, color: true, type: true },
        },
      },
    }),
    freshnessOf("amocrm", now),
  ]);

  const requested = Number(params.pipeline);
  const pipeline =
    pipelines.find((row) => row.id === requested) ?? pipelines[0] ?? null;

  const where = pipeline
    ? { pipelineId: pipeline.id, createdAt: { gte: since(days, now) } }
    : undefined;

  const [counts, managerCounts, managers] = pipeline
    ? await Promise.all([
        prisma.lead.groupBy({ by: ["statusId"], where, _count: { _all: true } }),
        prisma.lead.groupBy({
          by: ["statusId", "responsibleUserId"],
          where,
          _count: { _all: true },
        }),
        prisma.amoUser.findMany({ select: { id: true, name: true } }),
      ])
    : [[], [], []];

  const leadsByStatus = new Map(counts.map((row) => [row.statusId, row._count._all]));
  const stages: StageInput[] = (pipeline?.statuses ?? []).map((status) => ({
    statusId: status.id,
    name: status.name,
    sort: status.sort,
    color: status.color,
    type: status.type,
    leads: leadsByStatus.get(status.id) ?? 0,
  }));
  const funnel = buildFunnel(stages);

  const managerName = new Map(managers.map((user) => [user.id, user.name]));
  const managerFunnels = buildManagerFunnels(
    managerCounts.map((row) => ({
      // Ответственного могли удалить из аккаунта — сделки всё равно должны
      // попасть в разрез, иначе сумма по менеджерам не сойдётся с воронкой.
      manager: managerName.get(row.responsibleUserId ?? -1) ?? "без ответственного",
      statusId: row.statusId,
      leads: row._count._all,
    })),
    stages,
  );

  return (
    <>
      <PultHeader user={user} active="/funnel" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Воронка по этапам</h1>
            <p className="max-w-[62ch] text-sm text-ink-2">
              Сколько сделок стоит на каждом этапе и какую долю это составляет. Только
              количество: денег здесь нет. Сделка учитывается по тому этапу, где она стоит
              сейчас, — это срез на момент последнего сбора, а не движение за период.
            </p>
          </div>
          <PeriodSwitch current={days} basePath="/funnel" />
        </div>

        {pipelines.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-3">Воронка:</span>
            {pipelines.map((row) => (
              <Link
                key={row.id}
                href={`/funnel?days=${days}&pipeline=${row.id}`}
                aria-current={row.id === pipeline?.id ? "page" : undefined}
                className={`px-3 py-1 ${
                  row.id === pipeline?.id
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-ink-2 hover:text-ink"
                }`}
              >
                {row.name}
              </Link>
            ))}
          </div>
        )}

        <GradeLegend present={["C"]} />

        {!pipeline && (
          <p className="border border-line bg-surface px-4 py-6 text-sm text-ink-2">
            Воронки ещё не собраны. Запустите сбор: <code>npm run sync -- amocrm</code>
          </p>
        )}

        {pipeline && (
          <PultWindow
            title={`Этапы воронки «${pipeline.name}»`}
            grade="C"
            sources="amoCRM"
            freshness={freshness}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-3xl font-semibold tabular-nums">{funnel.total}</span>
              <span className="text-ink-2">
                сделок за {days} дней распределены по {funnel.filled} этапам из{" "}
                {funnel.stages.length}
              </span>
            </div>

            {funnel.total > 0 && (
              <div className="flex flex-col gap-2">
                <div
                  className="flex h-7 w-full overflow-hidden border border-line-2"
                  role="img"
                  aria-label={`Состав воронки: ${funnel.stages
                    .filter((stage) => stage.leads > 0)
                    .map((stage) => `${stage.name} ${stage.share}%`)
                    .join(", ")}`}
                >
                  {funnel.stages
                    .filter((stage) => stage.leads > 0)
                    .map((stage) => (
                      <span
                        key={stage.statusId}
                        className="h-full"
                        style={{ width: `${stage.share}%`, backgroundColor: stage.color }}
                        title={`${stage.name}: ${stage.leads} · ${stage.share}%`}
                      />
                    ))}
                </div>
                <span className="text-xs text-ink-3">
                  Вся полоса — 100% сделок периода. Цвета этапов те же, что в amoCRM.
                </span>
              </div>
            )}

            <ul className="flex flex-col">
              {funnel.stages.map((stage) => (
                <li
                  key={stage.statusId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0"
                >
                  <span
                    className="h-3 w-3 shrink-0 border border-line-2"
                    style={{ backgroundColor: stage.color }}
                    aria-hidden="true"
                  />
                  <span className="w-56 shrink-0 text-sm">
                    {stage.leads > 0 ? (
                      <Link
                        href={`/processing/leads?days=${days}&status=${stage.statusId}`}
                        className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                      >
                        {stage.name}
                      </Link>
                    ) : (
                      <span className="text-ink-3">{stage.name}</span>
                    )}
                  </span>
                  <span className="flex h-4 min-w-24 flex-1 items-center">
                    <span
                      className="h-4"
                      style={{
                        width: `${stage.relative}%`,
                        backgroundColor: stage.leads > 0 ? stage.color : "transparent",
                      }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-ink-2">
                    {stage.leads} · {stage.share === null ? "—" : `${stage.share}%`}
                  </span>
                </li>
              ))}
            </ul>

            <p className="border-l-2 border-line-2 pl-3 text-sm text-ink-3">
              Этап двигает менеджер руками — отсюда уровень C. Сделка, забытая на
              «Квалификации», выглядит здесь так же, как та, с которой работают сегодня.
              Сколько на самом деле стоит очередь, видно на вкладке «Обработка».
            </p>
          </PultWindow>
        )}

        {pipeline && managerFunnels.length > 0 && (
          <PultWindow
            title="Разрез по менеджерам"
            grade="C"
            sources="amoCRM"
            freshness={freshness}
          >
            <span className="text-sm text-ink-2">
              У каждого своя полоса на 100%: видно, чем отличается состав воронки. Доли
              считаются от сделок менеджера, а не от всех.
            </span>

            <ul className="flex flex-col gap-3">
              {managerFunnels.map((row) => (
                <li key={row.manager} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-medium">
                      <Link
                        href={`/processing/leads?days=${days}&manager=${encodeURIComponent(row.manager)}`}
                        className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                      >
                        {row.manager}
                      </Link>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-ink-2">
                      {row.total} сделок · в работе {row.open} · успешно {row.won} · закрыто{" "}
                      {row.lost}
                    </span>
                  </div>
                  <div
                    className="flex h-5 w-full overflow-hidden border border-line-2"
                    role="img"
                    aria-label={`${row.manager}: ${row.stages
                      .filter((stage) => stage.leads > 0)
                      .map((stage) => `${stage.name} ${stage.share}%`)
                      .join(", ")}`}
                  >
                    {row.stages
                      .filter((stage) => stage.leads > 0)
                      .map((stage) => (
                        <span
                          key={stage.statusId}
                          className="h-full"
                          style={{ width: `${stage.share}%`, backgroundColor: stage.color }}
                          title={`${stage.name}: ${stage.leads} · ${stage.share}%`}
                        />
                      ))}
                  </div>
                </li>
              ))}
            </ul>

            <details className="border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm">
                Полная таблица: менеджеры и этапы
              </summary>
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                      <th className="sticky left-0 bg-surface-2 px-3 py-2 font-medium">Менеджер</th>
                      {funnel.stages.map((stage) => (
                        <th key={stage.statusId} className="px-2 py-2 text-right font-medium">
                          {stage.name}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium">Всего</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerFunnels.map((row) => (
                      <tr key={row.manager} className="border-b border-line last:border-b-0">
                        <td className="sticky left-0 bg-surface px-3 py-2">{row.manager}</td>
                        {row.stages.map((stage) => (
                          <td
                            key={stage.statusId}
                            className="px-2 py-2 text-right font-mono tabular-nums"
                          >
                            {stage.leads === 0 ? (
                              <span className="text-ink-3">—</span>
                            ) : (
                              <Link
                                href={`/processing/leads?days=${days}&status=${stage.statusId}&manager=${encodeURIComponent(row.manager)}`}
                                className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                              >
                                {stage.leads}
                              </Link>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </PultWindow>
        )}
      </main>
    </>
  );
}
