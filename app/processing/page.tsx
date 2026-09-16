import Link from "next/link";
import { PeriodSwitch } from "@/components/period-switch";
import { PultHeader } from "@/components/pult-header";
import { PultWindow } from "@/components/pult-window";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime, formatMinutes } from "@/lib/format";
import { parsePeriod, since } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import {
  byHour,
  byManager,
  summarizeReplies,
  UNHANDLED_AFTER_MIN,
  waitingMinutes,
  FAST_REPLY_MIN,
} from "@/lib/processing";
import { freshnessOf } from "@/lib/sync/status";

const SOURCES_LABEL = "amoCRM · телефония";

function Share({ value }: { value: number | null }) {
  return <>{value === null ? "—" : `${value}%`}</>;
}

export default async function ProcessingPage(props: PageProps<"/processing">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const days = parsePeriod(params.days);
  const now = new Date();

  const [leadRows, unhandled, unhandledOldest, freshness] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: since(days, now) } },
      select: {
        id: true,
        createdAt: true,
        firstOutgoingCallAt: true,
        responsible: { select: { name: true } },
      },
    }),
    // Счётчик текущего состояния, а не метрика периода: на него реагируют
    // сегодня, поэтому период экрана его не фильтрует.
    prisma.lead.count({
      where: {
        isClosed: false,
        firstOutgoingCallAt: null,
        createdAt: { lt: new Date(now.getTime() - UNHANDLED_AFTER_MIN * 60_000) },
      },
    }),
    prisma.lead.findMany({
      where: {
        isClosed: false,
        firstOutgoingCallAt: null,
        createdAt: { lt: new Date(now.getTime() - UNHANDLED_AFTER_MIN * 60_000) },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        createdAt: true,
        responsible: { select: { name: true } },
      },
    }),
    freshnessOf("amocrm", now),
  ]);

  const leads = leadRows.map((lead) => ({
    id: lead.id,
    createdAt: lead.createdAt,
    firstOutgoingCallAt: lead.firstOutgoingCallAt,
    responsibleName: lead.responsible?.name ?? null,
  }));

  const summary = summarizeReplies(leads);
  const managers = byManager(leads);
  const hours = byHour(leads).filter((row) => row.leads > 0);
  const peakHour = Math.max(...hours.map((row) => row.leads), 1);
  const widest = Math.max(...summary.buckets.map((row) => row.count), 1);
  const canSeeNames = user.role !== "VIEWER";

  return (
    <>
      <PultHeader user={user} active="/processing" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Обработка обращений</h1>
            <p className="max-w-[62ch] text-sm text-ink-2">
              Самые достоверные данные пульта: время ставит система, а не человек. Считается
              по исходящим звонкам из amoCRM — переписка в мессенджерах сюда не попадает.
            </p>
          </div>
          <PeriodSwitch current={days} basePath="/processing" />
        </div>

        <PultWindow
          title="Необработанные обращения"
          grade="A"
          sources={SOURCES_LABEL}
          freshness={freshness}
          action={
            <Link href="/processing/leads?filter=unhandled" className="text-accent underline underline-offset-4">
              Все {unhandled} обращений списком →
            </Link>
          }
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <span
              className={`font-mono text-4xl font-semibold tabular-nums ${unhandled > 0 ? "text-crit" : "text-ok"}`}
            >
              {unhandled}
            </span>
            <span className="text-ink-2">
              сделок открыты и ждут первого звонка дольше {UNHANDLED_AFTER_MIN / 60} часов —
              прямо сейчас, независимо от выбранного периода
            </span>
          </div>

          {unhandledOldest.length > 0 && (
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                    <th className="px-3 py-2 font-medium">Сделка</th>
                    <th className="px-3 py-2 font-medium">Менеджер</th>
                    <th className="px-3 py-2 font-medium">Создана</th>
                    <th className="px-3 py-2 text-right font-medium">Ждёт</th>
                  </tr>
                </thead>
                <tbody>
                  {unhandledOldest.map((lead) => (
                    <tr key={lead.id} className="border-b border-line last:border-b-0">
                      <td className="px-3 py-2">
                        {canSeeNames ? lead.name : <span className="text-ink-3">Сделка {lead.id}</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-2">{lead.responsible?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-2">{formatDateTime(lead.createdAt)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-crit">
                        {formatMinutes(waitingMinutes({ ...lead, firstOutgoingCallAt: null, responsibleName: null }, now))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PultWindow>

        <PultWindow
          title="Первый контакт"
          grade="A"
          sources={SOURCES_LABEL}
          freshness={freshness}
        >
          <div className="grid gap-px bg-line sm:grid-cols-3">
            <div className="flex flex-col gap-1 bg-surface-2 px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">
                Медиана ответа
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {formatMinutes(summary.medianMinutes)}
              </span>
            </div>
            <div className="flex flex-col gap-1 bg-surface-2 px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">
                Быстрее {FAST_REPLY_MIN} минут
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums">
                <Share value={summary.fastShare} />
              </span>
              <span className="text-xs text-ink-3">от отвеченных</span>
            </div>
            <div className="flex flex-col gap-1 bg-surface-2 px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">
                Дошли до звонка
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums">
                <Share value={summary.answeredShare} />
              </span>
              <span className="text-xs text-ink-3">
                {summary.answered} из {summary.total} сделок
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink-2">
              Медиана прячет форму распределения, поэтому она разложена по корзинам. Любая
              строка открывается списком сделок.
            </span>
            <ul className="flex flex-col gap-1.5">
              {summary.buckets.map(({ bucket, count, share }) => (
                <li key={bucket.label} className="flex items-center gap-3 text-sm">
                  <Link
                    href={`/processing/leads?days=${days}&bucket=${encodeURIComponent(bucket.label)}`}
                    className="w-[9.5rem] shrink-0 text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink"
                  >
                    {bucket.label}
                  </Link>
                  <span className="flex h-4 flex-1 items-center">
                    <span
                      className="h-4 bg-accent"
                      style={{ width: `${Math.max((count / widest) * 100, count > 0 ? 1.5 : 0)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-ink-3">
                    {count} · <Share value={share} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </PultWindow>

        <PultWindow title="По менеджерам" grade="A" sources={SOURCES_LABEL} freshness={freshness}>
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  <th className="px-3 py-2 font-medium">Менеджер</th>
                  <th className="px-3 py-2 text-right font-medium">Сделок</th>
                  <th className="px-3 py-2 text-right font-medium">Дошли до звонка</th>
                  <th className="px-3 py-2 text-right font-medium">Быстрее {FAST_REPLY_MIN} мин</th>
                  <th className="px-3 py-2 text-right font-medium">Медиана</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((row) => (
                  <tr key={row.name} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/processing/leads?days=${days}&manager=${encodeURIComponent(row.name)}`}
                        className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.total}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-2">
                      <Share value={row.answeredShare} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-2">
                      <Share value={row.fastShare} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatMinutes(row.medianMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PultWindow>

        <PultWindow
          title="Дыры в графике"
          grade="A"
          sources={SOURCES_LABEL}
          freshness={freshness}
        >
          <span className="text-sm text-ink-2">
            Когда приходят обращения и как быстро на них отвечают. Часы местные — по времени
            объекта, иначе разрез не имеет смысла.
          </span>
          <div className="overflow-x-auto">
            <ul className="flex min-w-[640px] items-end gap-1">
              {hours.map((row) => (
                <li key={row.hour} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-[10px] tabular-nums text-ink-3">{row.leads}</span>
                  <span
                    className="w-full bg-accent"
                    style={{ height: `${Math.max((row.leads / peakHour) * 72, 2)}px` }}
                    title={`${row.leads} обращений, медиана ответа ${formatMinutes(row.medianMinutes)}`}
                  />
                  <span className="font-mono text-[10px] tabular-nums text-ink-3">
                    {String(row.hour).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-[9px] tabular-nums text-ink-3">
                    {row.medianMinutes === null
                      ? "—"
                      : row.medianMinutes < 60
                        ? `${Math.round(row.medianMinutes)}м`
                        : `${Math.round(row.medianMinutes / 60)}ч`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <span className="text-xs text-ink-3">
            Верхнее число — обращений за период, нижнее — медиана ответа на них.
          </span>
        </PultWindow>
      </main>
    </>
  );
}
