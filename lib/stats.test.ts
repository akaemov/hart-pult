import { describe, expect, it } from "vitest";
import { humanMinutes, median, minutesBetween, share } from "./stats";
import { normalizeSubdomain } from "./amo";

describe("median", () => {
  it("возвращает null на пустом наборе", () => {
    expect(median([])).toBeNull();
  });

  it("берёт середину для нечётной длины", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("усредняет два серединных значения для чётной", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("не изменяет исходный массив", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("share", () => {
  it("отличает отсутствие данных от нуля процентов", () => {
    expect(share(0, 0)).toBeNull();
    expect(share(0, 10)).toBe(0);
  });

  it("округляет до одного знака", () => {
    expect(share(1, 3)).toBe(33.3);
  });
});

describe("minutesBetween", () => {
  it("считает минуты между метками времени", () => {
    expect(minutesBetween(1_700_000_000, 1_700_000_900)).toBe(15);
  });
});

describe("humanMinutes", () => {
  it("переводит в часы и дни", () => {
    expect(humanMinutes(14)).toBe("14 мин");
    expect(humanMinutes(135)).toBe("2 ч 15 мин");
    expect(humanMinutes(60 * 26)).toBe("1 дн 2 ч");
    expect(humanMinutes(null)).toBe("нет данных");
  });
});

describe("normalizeSubdomain", () => {
  it("принимает и поддомен, и целый адрес кабинета", () => {
    expect(normalizeSubdomain("digitalhartdevru")).toBe("digitalhartdevru");
    expect(normalizeSubdomain("https://digitalhartdevru.amocrm.ru/")).toBe("digitalhartdevru");
    expect(normalizeSubdomain(" digitalhartdevru.amocrm.ru ")).toBe("digitalhartdevru");
  });
});
