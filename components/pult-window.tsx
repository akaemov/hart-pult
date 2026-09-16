import type { ReactNode } from "react";
import { FreshnessBadge } from "@/components/freshness-badge";
import type { Freshness } from "@/lib/sync/freshness";

/// Каркас окна пульта. Три обязательных элемента из ТЗ — источники, свежесть
/// и уровень достоверности — заданы пропсами, а не оставлены на усмотрение:
/// окно без них собрать нельзя.

export type Grade = "A" | "B" | "C" | "D";

const GRADE_TITLES: Record<Grade, string> = {
  A: "Машинная запись: время ставит система, изменить нельзя",
  B: "Собственный учёт: зависит от дисциплины ввода",
  C: "Оценка человека",
  D: "Внешние данные: годятся только для динамики",
};

const GRADE_CLASSES: Record<Grade, string> = {
  A: "bg-ok-soft text-ok",
  B: "bg-surface-2 text-accent",
  C: "bg-warn-soft text-warn",
  D: "bg-crit-soft text-crit",
};

export function PultWindow({
  title,
  grade,
  sources,
  freshness,
  action,
  children,
}: {
  title: string;
  grade: Grade;
  sources: string;
  freshness: Freshness;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold tracking-tight">{title}</h2>
          <span className={`chip ${GRADE_CLASSES[grade]}`} title={GRADE_TITLES[grade]}>
            {grade}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">{sources}</span>
          <FreshnessBadge freshness={freshness} />
        </div>
      </header>
      <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
      {action && <footer className="border-t border-line px-4 py-2.5 text-sm">{action}</footer>}
    </section>
  );
}
