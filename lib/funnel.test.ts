import { describe, expect, it } from "vitest";
import { buildFunnel, type StageInput } from "./funnel";

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
