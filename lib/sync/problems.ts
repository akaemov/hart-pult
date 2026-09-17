/// Разбор проблем источника: превращение сухих долей в список того, что мешает
/// пульту считать правду. Пороги заданы здесь, а не разбросаны по страницам,
/// и поэтому их видно и можно проверить тестами.

import { formatMinutes } from "../format";

export type Severity = "crit" | "warn" | "info";

export type Problem = {
  severity: Severity;
  title: string;
  detail: string;
  /// Что с этим делать и чья это зона ответственности.
  action: string;
};

export type AmoMetrics = {
  leads: number;
  withSource: number;
  withCall: number;
  unhandled: number;
  callsTotal: number;
  callsWithoutProvider: number;
  medianReplyMin: number | null;
};

const percent = (part: number, total: number) => (total === 0 ? 0 : (part / total) * 100);

export function detectAmoProblems(metrics: AmoMetrics): Problem[] {
  const problems: Problem[] = [];

  if (metrics.leads === 0) {
    return [
      {
        severity: "warn",
        title: "Сделок за период нет",
        detail: "Сбор отработал, но под период не попало ни одной сделки.",
        action: "Проверьте период и права интеграции на воронки.",
      },
    ];
  }

  const sourceShare = percent(metrics.withSource, metrics.leads);
  if (sourceShare < 90) {
    problems.push({
      severity: sourceShare < 70 ? "crit" : "warn",
      title: `Источник не заполнен у ${Math.round(100 - sourceShare)}% сделок`,
      detail:
        "Стоимость лида по каналам считается только по тем сделкам, где известен источник. " +
        "Остальные придётся показывать строкой «не определён».",
      action: "Сайт и интеграции должны писать UTM и источник в сделку. Зона отдела маркетинга.",
    });
  }

  const callShare = percent(metrics.withCall, metrics.leads);
  if (callShare < 85) {
    problems.push({
      severity: callShare < 60 ? "crit" : "warn",
      title: `${Math.round(100 - callShare)}% сделок без единого исходящего звонка`,
      detail:
        "Часть из них — дубли и спам, часть — обращения, до которых не дошли руки. " +
        "Данными эти случаи не разделить.",
      action: "Открыть выборку из 10–15 таких сделок и посмотреть, что это. Зона РОПа.",
    });
  }

  if (metrics.medianReplyMin !== null && metrics.medianReplyMin > 30) {
    problems.push({
      severity: metrics.medianReplyMin > 120 ? "crit" : "warn",
      title: `Медиана ответа — ${formatMinutes(metrics.medianReplyMin)}`,
      detail:
        "Чем дольше пауза, тем ниже конверсия: за час интерес остывает, за сутки покупатель уходит к другому.",
      action: "Разрез по менеджерам и часам — на вкладке «Обработка».",
    });
  }

  if (metrics.unhandled > 0) {
    problems.push({
      severity: metrics.unhandled > 50 ? "crit" : "warn",
      title: `${metrics.unhandled} обращений висят без звонка прямо сейчас`,
      detail:
        "Открытые сделки, по которым не было ни одного исходящего дольше двух рабочих часов. " +
        "Вечер, ночь и выходные в этот срок не входят.",
      action: "Разобрать очередь сегодня, а не в конце месяца.",
    });
  }

  if (metrics.callsTotal > 0 && metrics.callsWithoutProvider > 0) {
    problems.push({
      severity: "info",
      title: `${metrics.callsWithoutProvider} звонков без указания телефонии`,
      detail:
        "Такие звонки заведены вручную или пришли из интеграции, которая не проставляет источник.",
      action: "На расчёты не влияет, но показывает, что часть звонков живёт мимо телефонии.",
    });
  }

  return problems;
}
