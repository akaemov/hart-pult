import { describe, expect, it } from "vitest";
import {
  isWorkingDay,
  isWorkingHour,
  localHour,
  workingMinutesBetween,
  WORK_END_HOUR,
  WORK_START_HOUR,
} from "./working-time";

/// Объект в Екатеринбурге, UTC+5: 04:00Z — это 09:00 на месте.
const at = (iso: string) => new Date(iso);

describe("localHour", () => {
  it("переводит в местные часы, а не в UTC", () => {
    expect(localHour(at("2026-09-16T04:00:00Z"))).toBe(9);
    expect(localHour(at("2026-09-16T19:30:00Z"))).toBe(0);
  });
});

describe("isWorkingHour", () => {
  it("границы окна: девять входит, двадцать уже нет", () => {
    expect(isWorkingHour(at("2026-09-16T04:00:00Z"))).toBe(true);
    expect(isWorkingHour(at("2026-09-16T14:59:00Z"))).toBe(true);
    expect(isWorkingHour(at("2026-09-16T15:00:00Z"))).toBe(false);
    expect(WORK_START_HOUR).toBe(9);
    expect(WORK_END_HOUR).toBe(20);
  });
});

describe("workingMinutesBetween", () => {
  it("внутри рабочего дня считает как обычную разницу", () => {
    // 10:00 → 10:20 по месту.
    expect(workingMinutesBetween(at("2026-09-16T05:00:00Z"), at("2026-09-16T05:20:00Z"))).toBe(20);
  });

  it("выкидывает ночь: заявка вечером, звонок утром", () => {
    // 21:40 → 09:10 следующего дня: десять минут работы, а не одиннадцать часов.
    expect(workingMinutesBetween(at("2026-09-16T16:40:00Z"), at("2026-09-17T04:10:00Z"))).toBe(10);
  });

  it("считает остаток вечера и начало следующего дня", () => {
    // 18:00 → 09:30: два часа до закрытия плюс полчаса утром.
    expect(workingMinutesBetween(at("2026-09-16T13:00:00Z"), at("2026-09-17T04:30:00Z"))).toBe(150);
  });

  it("ночь целиком — это ноль рабочих минут", () => {
    // 21:00 → 23:00 того же дня.
    expect(workingMinutesBetween(at("2026-09-16T16:00:00Z"), at("2026-09-16T18:00:00Z"))).toBe(0);
  });

  it("каждый пропущенный день добавляет ровно рабочее окно", () => {
    // 10:00 → 10:00 через три дня: 3 × 11 часов.
    const from = at("2026-09-14T05:00:00Z");
    const to = at("2026-09-17T05:00:00Z");
    expect(workingMinutesBetween(from, to)).toBe(3 * 11 * 60);
  });

  it("обратный порядок и совпадающие моменты дают ноль", () => {
    expect(workingMinutesBetween(at("2026-09-16T05:00:00Z"), at("2026-09-16T05:00:00Z"))).toBe(0);
    expect(workingMinutesBetween(at("2026-09-16T06:00:00Z"), at("2026-09-16T05:00:00Z"))).toBe(0);
  });
});

describe("выходные", () => {
  it("суббота и воскресенье — не рабочие дни", () => {
    expect(isWorkingDay(at("2026-09-18T05:00:00Z"))).toBe(true); // пятница
    expect(isWorkingDay(at("2026-09-19T05:00:00Z"))).toBe(false); // суббота
    expect(isWorkingDay(at("2026-09-20T05:00:00Z"))).toBe(false); // воскресенье
    expect(isWorkingDay(at("2026-09-21T05:00:00Z"))).toBe(true); // понедельник
  });

  it("рабочий час в субботу — всё равно не рабочий", () => {
    expect(isWorkingHour(at("2026-09-19T05:00:00Z"))).toBe(false);
  });

  it("выходные внутри паузы не считаются", () => {
    // Пятница 18:00 → понедельник 09:30: два часа вечера пятницы
    // плюс полчаса утра понедельника.
    expect(workingMinutesBetween(at("2026-09-18T13:00:00Z"), at("2026-09-21T04:30:00Z"))).toBe(150);
  });

  it("заявка в субботу ждёт с утра понедельника", () => {
    // Суббота 10:00 → понедельник 10:00 — это один рабочий час.
    expect(workingMinutesBetween(at("2026-09-19T05:00:00Z"), at("2026-09-21T05:00:00Z"))).toBe(60);
  });

  it("суббота целиком — ноль рабочих минут", () => {
    expect(workingMinutesBetween(at("2026-09-19T05:00:00Z"), at("2026-09-19T09:00:00Z"))).toBe(0);
  });
});
