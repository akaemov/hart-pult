/// Повтор операции при временных сбоях базы.
///
/// Локальная база из `prisma dev` выполняет запросы строго по одному: пока идёт
/// длинная запись, вторая транзакция не может даже начаться и падает с
/// «Unable to start a transaction in the given time». Это не ошибка данных,
/// а очередь — такую операцию достаточно повторить.

const TRANSIENT = [
  "Unable to start a transaction",
  "Transaction API error",
  "Transaction already closed",
  "deadlock",
  "Timed out fetching a new connection",
];

export function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT.some((needle) => message.toLowerCase().includes(needle.toLowerCase()));
}

export async function withRetry<T>(
  what: string,
  run: () => Promise<T>,
  attempts = 4,
  wait: (attempt: number) => number = (attempt) => attempt * 2000,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      console.log(`   ${what}: база занята, повтор ${attempt} из ${attempts - 1}`);
      await new Promise((resolve) => setTimeout(resolve, wait(attempt)));
    }
  }
}
