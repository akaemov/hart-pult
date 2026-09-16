import type { Grade } from "@/components/pult-window";

/// Разметка достоверности. Метка стоит на каждом окне, но сама по себе буква
/// ничего не говорит — поэтому расшифровка живёт прямо на странице, а не
/// в подсказке при наведении и не в ТЗ, которое никто не откроет.

const LEVELS: { grade: Grade; title: string; detail: string; chip: string }[] = [
  {
    grade: "A",
    title: "Пишет машина",
    detail: "Метки времени ставит система: звонки, расход, визиты. Подделать нельзя.",
    chip: "bg-ok-soft text-ok",
  },
  {
    grade: "B",
    title: "Свой учёт",
    detail: "Продажи, остатки, план. Верны настолько, насколько дисциплинирован ввод.",
    chip: "bg-surface-2 text-accent",
  },
  {
    grade: "C",
    title: "Оценка человека",
    detail: "Квалификация лида, этапы сделки. Ставит менеджер, у которого есть свой интерес.",
    chip: "bg-warn-soft text-warn",
  },
  {
    grade: "D",
    title: "Внешние данные",
    detail: "Вордстат, рынок. Годятся только как динамика, абсолютным числам верить нельзя.",
    chip: "bg-crit-soft text-crit",
  },
];

export function GradeLegend({ present }: { present: Grade[] }) {
  return (
    <details className="border border-line bg-surface" open>
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium marker:content-none">
        Чему здесь можно верить
        <span className="ml-2 font-normal text-ink-3">
          — на этой вкладке {present.length === 1 ? "все окна уровня" : "уровни"}{" "}
          {present.join(", ")}
        </span>
      </summary>
      <ul className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {LEVELS.map((level) => {
          const here = present.includes(level.grade);
          return (
            <li
              key={level.grade}
              className={`flex flex-col gap-1.5 px-4 py-3 ${here ? "bg-surface" : "bg-surface-2"}`}
            >
              <span className="flex items-center gap-2">
                <span className={`chip ${level.chip}`}>{level.grade}</span>
                <span className={`text-sm font-medium ${here ? "" : "text-ink-3"}`}>
                  {level.title}
                </span>
                {here && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                    здесь
                  </span>
                )}
              </span>
              <span className={`text-xs ${here ? "text-ink-2" : "text-ink-3"}`}>{level.detail}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
