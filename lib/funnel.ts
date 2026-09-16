import { share } from "./stats";

/// Воронка по этапам: сколько сделок стоит на каждом и какую долю это
/// составляет. Денег здесь нет намеренно — только количество.

export type StageInput = {
  statusId: number;
  name: string;
  sort: number;
  color: string;
  /// 1 — «Неразобранное»: формально этап, но сделка на нём ещё ничья.
  type: number;
  leads: number;
};

export type StageRow = StageInput & {
  /// Доля от всех сделок периода, в процентах.
  share: number | null;
  /// Доля относительно самого населённого этапа — для длины полосы.
  relative: number;
};

export type Funnel = {
  stages: StageRow[];
  total: number;
  /// Этапы с сделками — остальные скрывать нельзя, но пустую воронку
  /// рисовать незачем.
  filled: number;
};

export function buildFunnel(stages: StageInput[]): Funnel {
  const total = stages.reduce((sum, stage) => sum + stage.leads, 0);
  const peak = Math.max(...stages.map((stage) => stage.leads), 1);

  return {
    total,
    filled: stages.filter((stage) => stage.leads > 0).length,
    stages: [...stages]
      // Порядок — как в amoCRM: у «успешно» и «закрыто» sort заведомо больше,
      // поэтому они сами оказываются в конце.
      .sort((a, b) => a.sort - b.sort)
      .map((stage) => ({
        ...stage,
        share: share(stage.leads, total),
        relative: (stage.leads / peak) * 100,
      })),
  };
}
