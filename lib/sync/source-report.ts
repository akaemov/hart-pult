import "server-only";
import { since, type Period } from "../period";
import { prisma } from "../prisma";
import { delayMinutes, UNHANDLED_AFTER_MIN } from "../processing";
import { median } from "../stats";
import { detectAmoProblems, type AmoMetrics, type Problem } from "./problems";

/// Разбор источника amoCRM: что собрано, насколько это годится и что мешает.

export type AmoReport = {
  metrics: AmoMetrics;
  problems: Problem[];
  providers: { name: string; calls: number }[];
};

export async function amoReport(days: Period, now = new Date()): Promise<AmoReport> {
  const from = since(days, now);

  const [leads, unhandled, providerRows, callsTotal] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: from } },
      select: { createdAt: true, firstOutgoingCallAt: true, hasSource: true },
    }),
    prisma.lead.count({
      where: {
        isClosed: false,
        firstOutgoingCallAt: null,
        createdAt: { lt: new Date(now.getTime() - UNHANDLED_AFTER_MIN * 60_000) },
      },
    }),
    prisma.call.groupBy({
      by: ["provider"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.call.count({ where: { createdAt: { gte: from } } }),
  ]);

  const delays = leads
    .map((lead) => delayMinutes({ ...lead, id: 0, responsibleName: null }))
    .filter((value): value is number => value !== null);

  const metrics: AmoMetrics = {
    leads: leads.length,
    withSource: leads.filter((lead) => lead.hasSource).length,
    withCall: leads.filter((lead) => lead.firstOutgoingCallAt !== null).length,
    unhandled,
    callsTotal,
    callsWithoutProvider: providerRows
      .filter((row) => row.provider === "")
      .reduce((sum, row) => sum + row._count._all, 0),
    medianReplyMin: median(delays),
  };

  return {
    metrics,
    problems: detectAmoProblems(metrics),
    providers: providerRows.map((row) => ({
      name: row.provider === "" ? "не указана" : row.provider,
      calls: row._count._all,
    })),
  };
}
