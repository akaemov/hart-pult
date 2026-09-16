import { describe, expect, it } from "vitest";
import { DEFAULT_PERIOD, parsePeriod, PERIODS, since } from "./period";

describe("parsePeriod", () => {
  it("принимает только известные периоды", () => {
    for (const days of PERIODS) expect(parsePeriod(String(days))).toBe(days);
  });

  it("на произвольное число из адресной строки отдаёт период по умолчанию", () => {
    // Иначе ?days=100000 превратится в запрос за всю базу.
    expect(parsePeriod("100000")).toBe(DEFAULT_PERIOD);
    expect(parsePeriod("неделя")).toBe(DEFAULT_PERIOD);
    expect(parsePeriod(undefined)).toBe(DEFAULT_PERIOD);
  });

  it("берёт первое значение, когда параметр повторён", () => {
    expect(parsePeriod(["7", "180"])).toBe(7);
  });
});

describe("since", () => {
  it("отсчитывает назад от переданного момента", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    expect(since(7, now).toISOString()).toBe("2026-09-09T12:00:00.000Z");
  });
});
