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

export type ManagerCell = { manager: string; statusId: number; leads: number };

export type ManagerFunnel = {
  manager: string;
  total: number;
  /// Этапы в порядке воронки, включая пустые: строки менеджеров должны
  /// совпадать колонка в колонку, иначе таблицу не прочитать.
  stages: { statusId: number; name: string; color: string; leads: number; share: number | null }[];
  won: number;
  lost: number;
  /// Сделки, которые ещё в работе: не «успешно» и не «закрыто».
  open: number;
};

/// Системные статусы amoCRM.
const WON = 142;
const LOST = 143;

/// Разрез воронки по ответственным. Менеджеры идут по числу сделок:
/// первым тот, через кого проходит основной поток.
export function buildManagerFunnels(cells: ManagerCell[], stages: StageInput[]): ManagerFunnel[] {
  const order = [...stages].sort((a, b) => a.sort - b.sort);
  const byManager = new Map<string, Map<number, number>>();

  for (const cell of cells) {
    const counts = byManager.get(cell.manager) ?? new Map<number, number>();
    counts.set(cell.statusId, (counts.get(cell.statusId) ?? 0) + cell.leads);
    byManager.set(cell.manager, counts);
  }

  return [...byManager]
    .map(([manager, counts]) => {
      const total = [...counts.values()].reduce((sum, leads) => sum + leads, 0);
      const won = counts.get(WON) ?? 0;
      const lost = counts.get(LOST) ?? 0;
      return {
        manager,
        total,
        won,
        lost,
        open: total - won - lost,
        stages: order.map((stage) => {
          const leads = counts.get(stage.statusId) ?? 0;
          return {
            statusId: stage.statusId,
            name: stage.name,
            color: stage.color,
            leads,
            share: share(leads, total),
          };
        }),
      };
    })
    .sort((a, b) => b.total - a.total);
}
