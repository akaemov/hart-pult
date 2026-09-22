import { describe, expect, it } from "vitest";
import { isFeedCopy, normalizeHouse, normalizeProject, pairProjects } from "./stock-pairs";

describe("normalizeProject", () => {
  it("сводит копию и основной проект к одному ключу", () => {
    expect(normalizeProject("ЗАРЯ ДЛЯ АВИТО")).toBe(normalizeProject("ЖК Заря"));
  });

  it("не спотыкается о латинскую O с ударением в «ПьермÓнт»", () => {
    expect(normalizeProject("ПЬЕРМОНТ ДЛЯ АВИТО")).toBe(normalizeProject("ПьермÓнт"));
  });

  it("не склеивает разные проекты", () => {
    expect(normalizeProject("ЖК Заря")).not.toBe(normalizeProject("ПьермÓнт"));
  });
});

describe("isFeedCopy", () => {
  it("узнаёт копию по пометке в названии", () => {
    expect(isFeedCopy("ПЬЕРМОНТ ДЛЯ АВИТО")).toBe(true);
    expect(isFeedCopy("ЖК Заря")).toBe(false);
  });
});

describe("normalizeHouse", () => {
  it("снимает пометку про фиды с названия секции", () => {
    expect(normalizeHouse("Секция Б (для фидов Авито)")).toBe("секция б");
    expect(normalizeHouse("Секция Б")).toBe("секция б");
  });
});

describe("pairProjects", () => {
  it("связывает обе копии с их проектами", () => {
    const { pairs, unpaired } = pairProjects([
      "ЖК Заря",
      "ПьермÓнт",
      "ЗАРЯ ДЛЯ АВИТО",
      "ПЬЕРМОНТ ДЛЯ АВИТО",
    ]);
    expect(pairs).toEqual([
      { copy: "ЗАРЯ ДЛЯ АВИТО", main: "ЖК Заря" },
      { copy: "ПЬЕРМОНТ ДЛЯ АВИТО", main: "ПьермÓнт" },
    ]);
    expect(unpaired).toEqual([]);
  });

  it("не прячет копию, которой не с чем сверяться", () => {
    const { pairs, unpaired } = pairProjects(["ЖК Заря", "УРАКСИНА ДЛЯ АВИТО"]);
    expect(pairs).toEqual([]);
    expect(unpaired).toEqual(["УРАКСИНА ДЛЯ АВИТО"]);
  });
});
