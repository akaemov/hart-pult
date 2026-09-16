import Link from "next/link";
import { PultHeader } from "@/components/pult-header";
import { leadUrl } from "@/lib/amo-link";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime, formatMinutes } from "@/lib/format";
import { describeFilter, parseLeadFilter, queryLeads } from "@/lib/leads-query";
import { prisma } from "@/lib/prisma";

const PAGE_LIMIT = 300;

export default async function LeadsPage(props: PageProps<"/processing/leads">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const filter = parseLeadFilter(params);
  const [leads, status] = await Promise.all([
    queryLeads(filter),
    filter.statusId
      ? prisma.status.findFirst({ where: { id: filter.statusId }, select: { name: true } })
      : null,
  ]);
  const shown = leads.slice(0, PAGE_LIMIT);
  const canSeeNames = user.role !== "VIEWER";

  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value] as [string, string]] : [],
    ),
  ).toString();

  return (
    <>
      <PultHeader user={user} active="/processing" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
        <div className="flex flex-col gap-2">
          <Link href="/processing" className="text-sm text-ink-2 hover:text-ink">
            ← Обработка обращений
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {describeFilter(filter, status?.name)}
              </h1>
              <p className="text-sm text-ink-2">
                Найдено {leads.length}
                {leads.length > PAGE_LIMIT && ` · показаны первые ${PAGE_LIMIT}`}
              </p>
            </div>
            <a
              href={`/processing/leads/export${query ? `?${query}` : ""}`}
              className="border border-line-2 bg-surface px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
            >
              Выгрузить в CSV
            </a>
          </div>
        </div>

        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                <th className="px-3 py-2 font-medium">Сделка</th>
                <th className="px-3 py-2 font-medium">Менеджер</th>
                <th className="px-3 py-2 font-medium">Создана</th>
                <th className="px-3 py-2 font-medium">Первый звонок</th>
                <th className="px-3 py-2 text-right font-medium">Ответ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((lead) => {
                const url = leadUrl(lead.id);
                return (
                  <tr key={lead.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                          title="Открыть карточку в amoCRM"
                        >
                          {canSeeNames ? lead.name : `Сделка ${lead.id}`}
                        </a>
                      ) : canSeeNames ? (
                        lead.name
                      ) : (
                        `Сделка ${lead.id}`
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{lead.responsibleName ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-2">{formatDateTime(lead.createdAt)}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {lead.firstOutgoingCallAt ? formatDateTime(lead.firstOutgoingCallAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {lead.delay !== null ? (
                        formatMinutes(lead.delay)
                      ) : (
                        <span className="text-crit">ждёт {formatMinutes(lead.waiting)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-3">
                    Под фильтр ничего не попало
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink-3">
          Имена и телефоны покупателей пульт не хранит — они открываются в карточке amoCRM,
          где права уже настроены. Время — по месту объекта.
        </p>
      </main>
    </>
  );
}
