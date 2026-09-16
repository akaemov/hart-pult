import { describe, expect, it } from "vitest";
import { buildFunnel, buildManagerFunnels, type StageInput } from "./funnel";

const stage = (statusId: number, name: string, sort: number, leads: number): StageInput => ({
  statusId,
  name,
  sort,
  color: "#fff",
  type: 0,
  leads,
});

describe("buildFunnel", () => {
  const stages = [
    stage(142, "Успешно реализовано", 10000, 10),
    stage(76351866, "Квалификация", 30, 60),
    stage(76351862, "Неразобранное", 10, 30),
  ];

  it("ставит этапы в порядке воронки, а закрытые — в конец", () => {
    expect(buildFunnel(stages).stages.map((row) => row.name)).toEqual([
      "Неразобранное",
      "Квалификация",
      "Успешно реализовано",
    ]);
  });

  it("считает доли от общего числа сделок", () => {
    const funnel = buildFunnel(stages);
    expect(funnel.total).toBe(100);
    expect(funnel.stages.map((row) => row.share)).toEqual([30, 60, 10]);
  });

  it("длина полосы считается от самого населённого этапа", () => {
    const funnel = buildFunnel(stages);
    expect(funnel.stages.find((row) => row.name === "Квалификация")?.relative).toBe(100);
    expect(funnel.stages.find((row) => row.name === "Неразобранное")?.relative).toBe(50);
  });

  it("на пустой воронке не делит на ноль", () => {
    const empty = buildFunnel([stage(1, "Пусто", 10, 0)]);
    expect(empty.total).toBe(0);
    expect(empty.filled).toBe(0);
    expect(empty.stages[0].share).toBeNull();
    expect(empty.stages[0].relative).toBe(0);
  });
});

describe("buildManagerFunnels", () => {
  const stages = [
    stage(76351866, "Квалификация", 30, 0),
    stage(142, "Успешно реализовано", 10000, 0),
    stage(143, "Закрыто и не реализовано", 11000, 0),
  ];
  const cells = [
    { manager: "Артур", statusId: 76351866, leads: 3 },
    { manager: "Артур", statusId: 143, leads: 7 },
    { manager: "Вадим", statusId: 142, leads: 2 },
  ];

  it("сортирует менеджеров по числу сделок", () => {
    expect(buildManagerFunnels(cells, stages).map((row) => row.manager)).toEqual([
      "Артур",
      "Вадим",
    ]);
  });

  it("разделяет выигранные, закрытые и оставшиеся в работе", () => {
    const [artur, vadim] = buildManagerFunnels(cells, stages);
    expect(artur).toMatchObject({ total: 10, won: 0, lost: 7, open: 3 });
    expect(vadim).toMatchObject({ total: 2, won: 2, lost: 0, open: 0 });
  });

  it("у всех менеджеров одинаковый набор этапов в одном порядке", () => {
    const rows = buildManagerFunnels(cells, stages);
    for (const row of rows) {
      expect(row.stages.map((s) => s.name)).toEqual([
        "Квалификация",
        "Успешно реализовано",
        "Закрыто и не реализовано",
      ]);
    }
  });

  it("доли считаются от сделок менеджера, а не от всех", () => {
    const [artur] = buildManagerFunnels(cells, stages);
    expect(artur.stages.find((s) => s.name === "Квалификация")?.share).toBe(30);
  });
});
