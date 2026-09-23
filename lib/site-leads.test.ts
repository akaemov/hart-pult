import { describe, expect, it } from "vitest";
import { ASSIGN_LIMIT_MIN, INTAKE_USER_ID, isSiteLead, isUnassigned } from "./site-leads";

describe("isSiteLead", () => {
  it("узнаёт по тегу интеграции", () => {
    expect(isSiteLead({ name: "Иванов", tags: ["tilda"] })).toBe(true);
    expect(isSiteLead({ name: "Иванов", tags: ["Tilda", "#заря"] })).toBe(true);
  });

  it("узнаёт по названию, если тег сняли", () => {
    expect(isSiteLead({ name: "Заявка с сайта [piermont.ru] с формы Скачать презентацию", tags: [] })).toBe(true);
  });

  it("не путает с обычной сделкой", () => {
    expect(isSiteLead({ name: "ЗАРЯ/Бураканова Наиля", tags: ["#заря", "2 кк"] })).toBe(false);
  });
});

describe("isUnassigned", () => {
  it("нераспределённая, пока ответственный — приёмщик", () => {
    expect(isUnassigned({ responsibleUserId: INTAKE_USER_ID })).toBe(true);
  });

  it("назначенная менеджеру — распределена", () => {
    expect(isUnassigned({ responsibleUserId: 13527210 })).toBe(false);
    expect(isUnassigned({ responsibleUserId: null })).toBe(false);
  });

  it("порог задан в рабочих минутах и заметно больше секунд робота", () => {
    expect(ASSIGN_LIMIT_MIN).toBeGreaterThan(1);
  });
});
