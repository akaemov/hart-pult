import "server-only";
import { detectChannel, detectObject, type Channel, type ObjectName } from "../channels";
import { prisma } from "../prisma";

/// Помесячная раскладка лидов по объектам и каналам — то, что уезжает
/// в таблицу заказчика.
///
/// Месяц считается по времени объекта: сделка, созданная 1 июня в 01:30
/// по Екатеринбургу, в UTC ещё майская, и без сдвига цифры на стыке месяцев
/// разойдутся с тем, что видит отдел продаж в amoCRM.

const TZ_OFFSET_HOURS = 5;

/// Целевой лид: дошёл минимум до «Квалифицированные лиды» либо реализован.
/// По закрытым без успеха судить нельзя — в сделке хранится текущий этап,
/// а не история, поэтому число заведомо занижено.
const QUALIFIED_STATUSES = [76351870, 76351874, 81945714, 76673310, 76462374, 76673362, 76673366, 76462410, 142];

export type MonthKey = { year: number; month: number };

export type ChannelCell = { channel: Channel; leads: number };

export type ObjectReport = {
  object: ObjectName;
  months: Map<string, { byChannel: Map<Channel, number>; total: number; qualified: number }>;
};

export function monthKey(date: Date): string {
  const shifted = new Date(date.getTime() + TZ_OFFSET_HOURS * 3600_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(key: string): MonthKey {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

export async function leadsByChannel(from: Date): Promise<{
  reports: Map<ObjectName, ObjectReport>;
  months: string[];
  totalLeads: number;
}> {
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: from } },
    select: {
      name: true,
      createdAt: true,
      statusId: true,
      sourceLabel: true,
      utmSource: true,
      utmCampaign: true,
      referrer: true,
    },
  });

  const reports = new Map<ObjectName, ObjectReport>();
  const months = new Set<string>();

  for (const lead of leads) {
    const object = detectObject(lead);
    const channel = detectChannel(lead);
    const key = monthKey(lead.createdAt);
    months.add(key);

    const report = reports.get(object) ?? { object, months: new Map() };
    const month = report.months.get(key) ?? { byChannel: new Map<Channel, number>(), total: 0, qualified: 0 };

    month.byChannel.set(channel, (month.byChannel.get(channel) ?? 0) + 1);
    month.total += 1;
    if (QUALIFIED_STATUSES.includes(lead.statusId)) month.qualified += 1;

    report.months.set(key, month);
    reports.set(object, report);
  }

  return { reports, months: [...months].sort(), totalLeads: leads.length };
}
