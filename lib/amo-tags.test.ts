import { describe, expect, it } from "vitest";
import { classifyTag, normalizeTag, planLead, type LeadTags } from "./amo-tags";

function lead(over: Partial<LeadTags> = {}): LeadTags {
  return { id: 1, tags: [], object: null, source: null, ...over };
}

describe("classifyTag", () => {
  it("узнаёт объект независимо от решётки и регистра", () => {
    expect(classifyTag("#заря")).toEqual({ kind: "object", value: "Заря" });
    expect(classifyTag("ПЬЕРМОНТ")).toEqual({ kind: "object", value: "Пьермонт" });
    expect(normalizeTag("  #Заря ")).toBe("заря");
  });

  it("переносит только однозначные источники", () => {
    expect(classifyTag("#агентство")).toEqual({ kind: "source", value: "Риелтор" });
    expect(classifyTag("tilda")).toEqual({ kind: "source", value: "Сайт" });
  });

  it("не раскладывает непонятный тег наугад", () => {
    for (const tag of ["ReQuest", "VKnew", "Instagram", "Авито", "CallMagnet"]) {
      expect(classifyTag(tag)).toEqual({ kind: "undecided" });
    }
  });

  it("отделяет теги, которые полем не являются", () => {
    for (const tag of ["2 кк", "1+", "студия", "Паркинг", "Презентация"]) {
      expect(classifyTag(tag).kind).toBe("not-a-field");
    }
  });
});

describe("planLead", () => {
  it("переносит объект и источник разом", () => {
    expect(planLead(lead({ tags: ["#заря", "#агентство"] }))).toEqual({
      kind: "write",
      object: "Заря",
      source: "Риелтор",
    });
  });

  it("не трогает заполненное поле: человек вернее тега", () => {
    expect(planLead(lead({ tags: ["#заря"], object: "Пьермонт" }))).toEqual({
      kind: "skip",
      reason: "поля уже заполнены",
    });
  });

  it("заполняет только пустое из двух полей", () => {
    expect(planLead(lead({ tags: ["#заря", "#агентство"], source: "Сайт" }))).toEqual({
      kind: "write",
      object: "Заря",
      source: null,
    });
  });

  it("обходит сделку с двумя объектами и называет их", () => {
    expect(planLead(lead({ tags: ["#заря", "#пьермонт"] }))).toEqual({
      kind: "conflict",
      field: "ЖК",
      values: ["Заря", "Пьермонт"],
    });
  });

  it("повтор одного и того же объекта конфликтом не считает", () => {
    expect(planLead(lead({ tags: ["#заря", "ЗАРЯ"] }))).toEqual({
      kind: "write",
      object: "Заря",
      source: null,
    });
  });

  it("сделку без подходящих тегов пропускает", () => {
    expect(planLead(lead({ tags: ["2 кк", "ReQuest"] }))).toEqual({
      kind: "skip",
      reason: "нет подходящих тегов",
    });
  });
});
