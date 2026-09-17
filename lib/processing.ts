import { hourOfDay } from "./format";
import { median, minutesBetween, share } from "./stats";
import { workingMinutesBetween, WORK_END_HOUR, WORK_START_HOUR } from "./working-time";

/// Расчёты окна «Обработка». Чистые функции над строками из базы: их можно
/// проверить тестами, не поднимая ни базу, ни amoCRM.

/// Обращение считается необработанным, если два РАБОЧИХ часа по нему не было
/// исходящего звонка. Порог из ТЗ, время — рабочее: заявка, пришедшая в 23:00,
/// не должна к часу ночи числиться брошенной.
export const UNHANDLED_AFTER_MIN = 120;

/// Подпись к любой цифре времени ответа. Без неё «15 минут» и «15 рабочих
/// минут» выглядят одинаково, а значат разное.
export const WORKING_HOURS_NOTE = `рабочее время, ${WORK_START_HOUR}:00–${WORK_END_HOUR}:00`;
/// Быстрый ответ. Всё, что дольше, в недвижимости уже остывает.
export const FAST_REPLY_MIN = 30;

export type LeadRow = {
  id: number;
  createdAt: Date;
  firstOutgoingCallAt: Date | null;
  responsibleName: string | null;
  /// Нужно только счётчику необработанных: закрытую сделку никто не ждёт.
  isClosed?: boolean;
};

export type Bucket = { label: string; fromMin: number; toMin: number };

/// Медиана прячет форму распределения: на этих данных пятая часть обращений
/// обрабатывается сразу, а сорок процентов — дольше суток, и одно число
/// про это не скажет.
export const DELAY_BUCKETS: readonly Bucket[] = [
  { label: "до 5 минут", fromMin: 0, toMin: 5 },
  { label: "5–30 минут", fromMin: 5, toMin: 30 },
  { label: "30 минут – 2 часа", fromMin: 30, toMin: 120 },
  { label: "2–8 часов", fromMin: 120, toMin: 480 },
  { label: "8–24 часа", fromMin: 480, toMin: 1440 },
  { label: "больше суток", fromMin: 1440, toMin: Number.POSITIVE_INFINITY },
];

/// Сколько РАБОЧЕГО времени прошло до первого исходящего звонка.
export function delayMinutes(lead: LeadRow): number | null {
  if (!lead.firstOutgoingCallAt) return null;
  return workingMinutesBetween(lead.createdAt, lead.firstOutgoingCallAt);
}

/// Календарная разница — для подсказки рядом с рабочей.
/// Показывает, сколько на самом деле прошло по часам на стене.
export function calendarDelayMinutes(lead: LeadRow): number | null {
  if (!lead.firstOutgoingCallAt) return null;
  return minutesBetween(
    Math.floor(lead.createdAt.getTime() / 1000),
    Math.floor(lead.firstOutgoingCallAt.getTime() / 1000),
  );
}

export function bucketFor(minutes: number): Bucket {
  return (
    DELAY_BUCKETS.find((bucket) => minutes >= bucket.fromMin && minutes < bucket.toMin) ??
    DELAY_BUCKETS[DELAY_BUCKETS.length - 1]
  );
}

export type ReplySummary = {
  total: number;
  answered: number;
  answeredShare: number | null;
  medianMinutes: number | null;
  fastShare: number | null;
  buckets: { bucket: Bucket; count: number; share: number | null }[];
};

export function summarizeReplies(leads: LeadRow[]): ReplySummary {
  const delays = leads.map(delayMinutes).filter((value): value is number => value !== null);
  const fast = delays.filter((minutes) => minutes <= FAST_REPLY_MIN).length;

  return {
    total: leads.length,
    answered: delays.length,
    answeredShare: share(delays.length, leads.length),
    medianMinutes: median(delays),
    fastShare: share(fast, delays.length),
    buckets: DELAY_BUCKETS.map((bucket) => {
      const count = delays.filter(
        (minutes) => minutes >= bucket.fromMin && minutes < bucket.toMin,
      ).length;
      return { bucket, count, share: share(count, delays.length) };
    }),
  };
}

export type ManagerRow = {
  name: string;
  total: number;
  answered: number;
  answeredShare: number | null;
  medianMinutes: number | null;
  fastShare: number | null;
};

export function byManager(leads: LeadRow[]): ManagerRow[] {
  const groups = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    // Ответственного могли удалить из аккаунта — такие сделки не прячем,
    // иначе сумма по менеджерам не сойдётся с общим числом.
    const name = lead.responsibleName ?? "без ответственного";
    groups.set(name, [...(groups.get(name) ?? []), lead]);
  }

  return [...groups]
    .map(([name, rows]) => {
      const summary = summarizeReplies(rows);
      return {
        name,
        total: summary.total,
        answered: summary.answered,
        answeredShare: summary.answeredShare,
        medianMinutes: summary.medianMinutes,
        fastShare: summary.fastShare,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export type HourRow = { hour: number; leads: number; medianMinutes: number | null };

/// Заявки и скорость ответа по часам суток — окно «Дыры в графике».
/// Час берётся по времени объекта: в этом весь смысл разреза.
export function byHour(leads: LeadRow[]): HourRow[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const rows = leads.filter((lead) => hourOfDay(lead.createdAt) === hour);
    const delays = rows.map(delayMinutes).filter((value): value is number => value !== null);
    return { hour, leads: rows.length, medianMinutes: median(delays) };
  });
}

/// Сколько РАБОЧЕГО времени обращение висит без ответа прямо сейчас.
export function waitingMinutes(lead: LeadRow, now: Date): number {
  return workingMinutesBetween(lead.createdAt, now);
}

/// Календарное ожидание — для подсказки.
export function calendarWaitingMinutes(lead: LeadRow, now: Date): number {
  return minutesBetween(
    Math.floor(lead.createdAt.getTime() / 1000),
    Math.floor(now.getTime() / 1000),
  );
}

/// Необработанное обращение: открыто, ни одного исходящего звонка и порог
/// уже вышел. Считается в коде, а не запросом: рабочие часы в SQL не выразить,
/// а открытых сделок без звонка — сотни, не миллионы.
export function isUnhandled(lead: LeadRow, now: Date): boolean {
  if (lead.isClosed) return false;
  if (lead.firstOutgoingCallAt) return false;
  return waitingMinutes(lead, now) > UNHANDLED_AFTER_MIN;
}
