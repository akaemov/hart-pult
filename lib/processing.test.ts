import { describe, expect, it } from "vitest";
import { bucketFor, byHour, byManager, delayMinutes, summarizeReplies } from "./processing";

const at = (iso: string) => new Date(iso);

/// 09:00 в Екатеринбурге — это 04:00 UTC.
const lead = (created: string, first: string | null, responsibleName: string | null = "Артур") => ({
  id: Math.random(),
  createdAt: at(created),
  firstOutgoingCallAt: first ? at(first) : null,
  responsibleName,
});

describe("delayMinutes", () => {
  it("возвращает null, когда звонка не было", () => {
    expect(delayMinutes(lead("2026-09-01T04:00:00Z", null))).toBeNull();
  });

  it("считает минуты до первого звонка", () => {
    expect(delayMinutes(lead("2026-09-01T04:00:00Z", "2026-09-01T04:12:00Z"))).toBe(12);
  });
});

describe("bucketFor", () => {
  it("кладёт границу в старшую корзину", () => {
    expect(bucketFor(5).label).toBe("5–30 минут");
    expect(bucketFor(4.9).label).toBe("до 5 минут");
  });

  it("всё, что дольше суток, попадает в последнюю корзину", () => {
    expect(bucketFor(100_000).label).toBe("больше суток");
  });
});

describe("summarizeReplies", () => {
  const leads = [
    lead("2026-09-01T04:00:00Z", "2026-09-01T04:03:00Z"),
    lead("2026-09-01T05:00:00Z", "2026-09-01T06:00:00Z"),
    lead("2026-09-01T06:00:00Z", null),
  ];

  it("считает долю отвеченных от всех, а быстрых — от отвеченных", () => {
    const summary = summarizeReplies(leads);
    expect(summary.total).toBe(3);
    expect(summary.answered).toBe(2);
    expect(summary.answeredShare).toBe(66.7);
    // Быстрый — один из двух отвеченных, а не из трёх сделок.
    expect(summary.fastShare).toBe(50);
  });

  it("медиана считается только по отвеченным", () => {
    expect(summarizeReplies(leads).medianMinutes).toBe(31.5);
  });

  it("на пустом наборе отдаёт null, а не ноль", () => {
    const summary = summarizeReplies([]);
    expect(summary.medianMinutes).toBeNull();
    expect(summary.answeredShare).toBeNull();
  });

  it("сумма корзин равна числу отвеченных", () => {
    const summary = summarizeReplies(leads);
    expect(summary.buckets.reduce((sum, row) => sum + row.count, 0)).toBe(summary.answered);
  });
});

describe("byManager", () => {
  it("сортирует по числу сделок и не теряет сделки без ответственного", () => {
    const rows = byManager([
      lead("2026-09-01T04:00:00Z", null, "Артур"),
      lead("2026-09-01T04:00:00Z", null, "Артур"),
      lead("2026-09-01T04:00:00Z", null, null),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Артур", "без ответственного"]);
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(3);
  });
});

describe("byHour", () => {
  it("раскладывает по местным часам, а не по UTC", () => {
    const rows = byHour([lead("2026-09-01T04:00:00Z", "2026-09-01T04:10:00Z")]);
    expect(rows[9].leads).toBe(1);
    expect(rows[9].medianMinutes).toBe(10);
    expect(rows[4].leads).toBe(0);
  });

  it("всегда отдаёт 24 часа", () => {
    expect(byHour([])).toHaveLength(24);
  });
});
