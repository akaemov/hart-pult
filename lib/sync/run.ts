import type { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../prisma";
import type { SourceId } from "./sources";

/// Прогон сбора по одному источнику. Каждый запуск оставляет строку в SyncRun,
/// каждый ответ API — строку в RawPayload.
///
/// Параллельные запуски одного источника запрещены: локальная база выполняет
/// запросы по одному, и ручная выгрузка за год, столкнувшись с автосбором по
/// расписанию, роняет обе. Второй запуск не ошибка — он просто пропускается.

export type SyncContext = {
  runId: string;
  saveRaw(endpoint: string, payload: Prisma.InputJsonValue): Promise<void>;
};

export type Collector = (ctx: SyncContext) => Promise<{ rows: number }>;

export type SyncResult =
  | { skipped: true; runningSince: Date }
  | { skipped: false; runId: string; rows: number };

const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

export async function runSync(source: SourceId, collect: Collector): Promise<SyncResult> {
  // Процесс, убитый посреди сбора, оставляет RUNNING навсегда — закрываем такие
  // прогоны, чтобы окно не показывало «идёт сбор» сутками.
  await prisma.syncRun.updateMany({
    where: { source, status: "RUNNING", startedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    data: { status: "FAILED", finishedAt: new Date(), error: "Прерван: процесс завершился, не закрыв прогон" },
  });

  const busy = await prisma.syncRun.findFirst({
    where: { source, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (busy) return { skipped: true, runningSince: busy.startedAt };

  const run = await prisma.syncRun.create({ data: { source } });
  const ctx: SyncContext = {
    runId: run.id,
    async saveRaw(endpoint, payload) {
      await prisma.rawPayload.create({ data: { source, endpoint, payload, syncRunId: run.id } });
    },
  };

  try {
    const { rows } = await collect(ctx);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), rowsFetched: rows },
    });
    return { skipped: false, runId: run.id, rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 2000) },
    });
    throw error;
  }
}
