import "server-only";
import { parsePeriod, since, type Period } from "./period";
import { prisma } from "./prisma";
import {
  bucketFor,
  delayMinutes,
  UNHANDLED_AFTER_MIN,
  waitingMinutes,
  type LeadRow,
} from "./processing";

/// Список сделок за цифрой — правило 1 из ТЗ: по любому числу можно провалиться
/// и увидеть, из чего оно сложилось. Одна и та же выборка обслуживает и таблицу
/// на экране, и выгрузку в CSV: иначе они однажды разойдутся.

export type LeadFilter = {
  days: Period;
  bucket: string | null;
  manager: string | null;
  unhandled: boolean;
};

export type LeadListRow = LeadRow & {
  name: string;
  /// Сколько ждали до первого звонка. Null — звонка не было.
  delay: number | null;
  /// Сколько ждёт прямо сейчас, если звонка так и не было.
  waiting: number | null;
};

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.trim() !== "" ? first : null;
}

export function parseLeadFilter(params: Params): LeadFilter {
  return {
    days: parsePeriod(params.days),
    bucket: one(params.bucket),
    manager: one(params.manager),
    unhandled: one(params.filter) === "unhandled",
  };
}

export function describeFilter(filter: LeadFilter): string {
  if (filter.unhandled) {
    return `Открытые сделки без единого исходящего звонка дольше ${UNHANDLED_AFTER_MIN / 60} часов`;
  }
  const parts = [`за ${filter.days} дней`];
  if (filter.bucket) parts.push(`ответ «${filter.bucket}»`);
  if (filter.manager) parts.push(`менеджер ${filter.manager}`);
  return `Сделки ${parts.join(", ")}`;
}

export async function queryLeads(filter: LeadFilter, now = new Date()): Promise<LeadListRow[]> {
  // Необработанные — состояние на сейчас, а не срез периода: они и создаются
  // раньше любого выбранного окна, и период их фильтровать не должен.
  const where = filter.unhandled
    ? {
        isClosed: false,
        firstOutgoingCallAt: null,
        createdAt: { lt: new Date(now.getTime() - UNHANDLED_AFTER_MIN * 60_000) },
      }
    : { createdAt: { gte: since(filter.days, now) } };

  const rows = await prisma.lead.findMany({
    where: {
      ...where,
      ...(filter.manager === "без ответственного"
        ? { responsibleUserId: null }
        : filter.manager
          ? { responsible: { name: filter.manager } }
          : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      firstOutgoingCallAt: true,
      responsible: { select: { name: true } },
    },
  });

  const leads = rows.map((row) => {
    const lead: LeadRow = {
      id: row.id,
      createdAt: row.createdAt,
      firstOutgoingCallAt: row.firstOutgoingCallAt,
      responsibleName: row.responsible?.name ?? null,
    };
    const delay = delayMinutes(lead);
    return {
      ...lead,
      name: row.name,
      delay,
      waiting: delay === null ? waitingMinutes(lead, now) : null,
    };
  });

  // Корзина задержки считается в коде, а не в SQL: это разница двух полей,
  // и ради неё держать вычисляемый столбец в базе незачем.
  const filtered = filter.bucket
    ? leads.filter((lead) => lead.delay !== null && bucketFor(lead.delay).label === filter.bucket)
    : leads;

  return filter.unhandled
    ? filtered.sort((a, b) => (b.waiting ?? 0) - (a.waiting ?? 0))
    : filtered.sort((a, b) => (b.delay ?? 0) - (a.delay ?? 0));
}
