import { describe, expect, it } from "vitest";
import { classifyTag, normalizeTag, planLead, resolveSource, type LeadTags } from "./amo-tags";

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
    for (const tag of ["Репрофит риэл", "банер", "2е", "ра"]) {
      expect(classifyTag(tag)).toEqual({ kind: "undecided" });
    }
  });

  it("отделяет теги, которые полем не являются", () => {
    for (const tag of ["2 кк", "1+", "студия", "Паркинг", "Презентация"]) {
      expect(classifyTag(tag).kind).toBe("not-a-field");
    }
  });
});

describe("resolveSource", () => {
  it("канал привлечения важнее мессенджера, в котором говорили", () => {
    expect(resolveSource(["WhatsApp", "Яндекс.Директ"])).toBe("Яндекс.Директ");
    expect(resolveSource(["Сайт", "Авито"])).toBe("Авито");
  });

  it("сайт уступает соцсети", () => {
    expect(resolveSource(["Сайт", "Instagram"])).toBe("Instagram");
  });

  it("два тега одного уровня не разводит", () => {
    expect(resolveSource(["Instagram", "Telegram"])).toBeNull();
  });

  it("риелтора в лестницу не пускает: это вопрос РОПа", () => {
    expect(resolveSource(["Риелтор", "Сайт"])).toBeNull();
  });
});

describe("planLead", () => {
  it("переносит объект и источник разом", () => {
    expect(planLead(lead({ tags: ["#заря", "#агентство"] }))).toEqual({
      object: "Заря",
      source: "Риелтор",
      conflicts: [],
    });
  });

  it("не трогает заполненное поле: человек вернее тега", () => {
    expect(planLead(lead({ tags: ["#заря"], object: "Пьермонт" }))).toMatchObject({ object: null });
  });

  it("заполняет только пустое из двух полей", () => {
    expect(planLead(lead({ tags: ["#заря", "#агентство"], source: "Сайт" }))).toEqual({
      object: "Заря",
      source: null,
      conflicts: [],
    });
  });

  it("спор об источнике не отменяет перенос объекта", () => {
    const plan = planLead(lead({ tags: ["#заря", "#агентство", "tilda"] }));
    expect(plan.object).toBe("Заря");
    expect(plan.source).toBeNull();
    expect(plan.conflicts).toEqual([{ field: "Источник заявки", values: ["Риелтор", "Сайт"] }]);
  });

  it("два объекта в тегах оставляют поле пустым и попадают в отчёт", () => {
    const plan = planLead(lead({ tags: ["#заря", "#пьермонт"] }));
    expect(plan.object).toBeNull();
    expect(plan.conflicts).toEqual([{ field: "ЖК", values: ["Заря", "Пьермонт"] }]);
  });

  it("повтор одного и того же объекта конфликтом не считает", () => {
    expect(planLead(lead({ tags: ["#заря", "ЗАРЯ"] }))).toEqual({
      object: "Заря",
      source: null,
      conflicts: [],
    });
  });

  it("сделку без подходящих тегов пропускает", () => {
    expect(planLead(lead({ tags: ["2 кк", "Паркинг"] }))).toEqual({
      object: null,
      source: null,
      conflicts: [],
    });
  });
});

describe("classifyTag: каналы и шаблоны", () => {
  it("разводит канал привлечения и инструмент захвата", () => {
    expect(classifyTag("Яндекс.Директ")).toEqual({ kind: "source", value: "Яндекс.Директ" });
    // Форма на сайте меняется каждый год, канал остаётся.
    expect(classifyTag("marquiz")).toEqual({ kind: "source", value: "Сайт" });
    expect(classifyTag("ReQuest")).toEqual({ kind: "source", value: "Сайт" });
  });

  it("узнаёт аккаунты Wazzup по шаблону", () => {
    for (const tag of ["WZ (HART development)", "WZ (79997575499)", "WZ (zarya.ufa)"]) {
      expect(classifyTag(tag)).toEqual({ kind: "source", value: "WhatsApp" });
    }
  });

  it("сводит ВК, написанный тремя способами", () => {
    for (const tag of ["ВК", "VKnew", "vk_238211713_1"]) {
      expect(classifyTag(tag)).toEqual({ kind: "source", value: "ВКонтакте" });
    }
  });

  it("чинит опечатку в теге объекта", () => {
    expect(classifyTag("зара")).toEqual({ kind: "object", value: "Заря" });
  });

  it("служебную метку импорта полем не считает", () => {
    expect(classifyTag("импорт_05052025_1252").kind).toBe("not-a-field");
  });

  it("по-прежнему не гадает там, где ответа нет", () => {
    for (const tag of ["SMM", "Таргет", "банер", "Репрофит риэл"]) {
      expect(classifyTag(tag)).toEqual({ kind: "undecided" });
    }
  });
});
