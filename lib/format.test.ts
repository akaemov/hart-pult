import { describe, expect, it } from "vitest";
import { formatAge, formatTime } from "./format";

describe("формат возраста данных", () => {
  it.each([
    [0, "только что"],
    [14, "14 мин назад"],
    [60, "1 ч назад"],
    [47 * 60 + 59, "47 ч назад"],
    [48 * 60, "2 дн. назад"],
  ])("%i мин → %s", (minutes, expected) => {
    expect(formatAge(minutes)).toBe(expected);
  });

  // Пояс объекта, а не сервера и не Москвы: офис продаж в Екатеринбурге,
  // и «ответили за 15 минут» имеет смысл только в местных часах.
  it("время показывается по времени объекта", () => {
    expect(formatTime(new Date("2026-09-11T09:05:00Z"))).toBe("14:05");
  });
});
