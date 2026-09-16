import "server-only";
import { prisma } from "../prisma";
import { classifyFreshness, type Freshness } from "./freshness";
import { SOURCES, type SourceId } from "./sources";

/// Свежесть данных источника — для отметки на каждом окне.
export async function freshnessOf(source: SourceId, now = new Date()): Promise<Freshness> {
  const last = await prisma.syncRun.findFirst({
    where: { source, status: "SUCCESS" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  const maxAge = SOURCES.find((s) => s.id === source)?.maxAgeMinutes ?? 60;
  return classifyFreshness(last?.finishedAt ?? null, maxAge, now);
}
