import { describe, expect, it } from "vitest";
import { classifyFreshness } from "./freshness";

const now = new Date("2026-09-11T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("свежесть данных", () => {
  it("без единого успешного сбора — never, а не stale", () => {
    expect(classifyFreshness(null, 30, now)).toEqual({ state: "never" });
  });

  it("в пределах срока — fresh, граница включительно", () => {
    expect(classifyFreshness(minutesAgo(30), 30, now)).toMatchObject({ state: "fresh", ageMinutes: 30 });
  });

  it("за пределами срока — stale", () => {
    expect(classifyFreshness(minutesAgo(31), 30, now)).toMatchObject({ state: "stale", ageMinutes: 31 });
  });

  it("часы сервера отстали — возраст не уходит в минус", () => {
    expect(classifyFreshness(minutesAgo(-5), 30, now)).toMatchObject({ state: "fresh", ageMinutes: 0 });
  });
});
