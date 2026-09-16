import { describe, expect, it } from "vitest";
import { detectAmoProblems, type AmoMetrics } from "./problems";

const healthy: AmoMetrics = {
  leads: 100,
  withSource: 95,
  withCall: 90,
  unhandled: 0,
  callsTotal: 120,
  callsWithoutProvider: 0,
  medianReplyMin: 12,
};

describe("detectAmoProblems", () => {
  it("молчит, когда всё в порядке", () => {
    expect(detectAmoProblems(healthy)).toEqual([]);
  });

  it("отличает пустой период от плохих данных", () => {
    const problems = detectAmoProblems({ ...healthy, leads: 0 });
    expect(problems).toHaveLength(1);
    expect(problems[0].title).toBe("Сделок за период нет");
  });

  it("повышает серьёзность, когда источник пуст у трети сделок", () => {
    expect(detectAmoProblems({ ...healthy, withSource: 85 })[0].severity).toBe("warn");
    expect(detectAmoProblems({ ...healthy, withSource: 60 })[0].severity).toBe("crit");
  });

  it("считает долю сделок без звонка от всех сделок", () => {
    const problems = detectAmoProblems({ ...healthy, withCall: 43 });
    expect(problems[0].title).toBe("57% сделок без единого исходящего звонка");
    expect(problems[0].severity).toBe("crit");
  });

  it("показывает медиану человеческим текстом, а не минутами", () => {
    const problems = detectAmoProblems({ ...healthy, medianReplyMin: 913 });
    expect(problems[0].title).toBe("Медиана ответа — 15 ч 13 мин");
  });

  it("не жалуется на медиану, когда звонков не было вовсе", () => {
    const problems = detectAmoProblems({ ...healthy, medianReplyMin: null });
    expect(problems.some((p) => p.title.includes("Медиана"))).toBe(false);
  });

  it("звонки без телефонии — замечание, а не проблема", () => {
    const problems = detectAmoProblems({ ...healthy, callsWithoutProvider: 8 });
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("info");
  });
});
