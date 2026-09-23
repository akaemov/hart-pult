import { describe, expect, it } from "vitest";
import { localDay, monthsAgo } from "./month";

/// Объект в Екатеринбурге, UTC+5: месяц начинается в 19:00 UTC предыдущего дня.
describe("monthsAgo", () => {
  const now = new Date("2026-09-17T06:00:00Z"); // 17 сентября, 11:00 по месту

  it("прошлый месяц — это август целиком", () => {
    const august = monthsAgo(1, now);
    expect(august.label).toBe("август 2026");
    expect(august.from.toISOString()).toBe("2026-07-31T19:00:00.000Z");
    expect(august.to.toISOString()).toBe("2026-08-31T19:00:00.000Z");
  });

  it("позапрошлый — июль", () => {
    expect(monthsAgo(2, now).label).toBe("июль 2026");
  });

  it("границы месяцев стыкуются без зазора", () => {
    expect(monthsAgo(2, now).to.getTime()).toBe(monthsAgo(1, now).from.getTime());
  });

  it("в январе прошлый месяц — декабрь прошлого года", () => {
    const january = new Date("2026-01-10T06:00:00Z");
    expect(monthsAgo(1, january).label).toBe("декабрь 2025");
  });
});

describe("localDay", () => {
  it("берёт день по месту объекта, а не по UTC", () => {
    // 22:30 по UTC — это уже следующее утро в Екатеринбурге (UTC+5).
    expect(localDay(new Date("2026-09-22T22:30:00Z")).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });

  it("день не уезжает назад для утреннего времени", () => {
    expect(localDay(new Date("2026-09-23T06:00:00Z")).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });
});
