import { describe, expect, it, vi } from "vitest";
import { isTransient, withRetry } from "./retry";

describe("isTransient", () => {
  it("узнаёт очередь к базе, а не ошибку данных", () => {
    expect(isTransient(new Error("Transaction API error: Unable to start a transaction"))).toBe(true);
    expect(isTransient(new Error("Unique constraint failed on the fields: (`id`)"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("повторяет временный сбой и возвращает результат", async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("Unable to start a transaction in the given time");
      return "готово";
    });
    await expect(withRetry("запись", run, 4, () => 0)).resolves.toBe("готово");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("ошибку данных не повторяет вовсе", async () => {
    const run = vi.fn(async () => {
      throw new Error("Unique constraint failed");
    });
    await expect(withRetry("запись", run, 4, () => 0)).rejects.toThrow("Unique constraint");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("сдаётся после исчерпания попыток", async () => {
    const run = vi.fn(async () => {
      throw new Error("Unable to start a transaction");
    });
    await expect(withRetry("запись", run, 3, () => 0)).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(3);
  });
});
