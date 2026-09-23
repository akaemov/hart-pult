/// Проверка автораспределения заявок с сайта.
///
/// Заявки с Tilda приходят на одного фиксированного человека, а дальше их
/// разбирает робот внутри amoCRM. С 13 августа 2026 робот перестал срабатывать,
/// и заявки по три часа лежали ничьими — заметили это только через пять недель.
/// Окно существует, чтобы следующая такая поломка всплыла в тот же день.

/// Кому Tilda отдаёт заявку при создании. Пока распределение не сработало,
/// ответственным остаётся он.
export const INTAKE_USER_ID = 12445958; // Елена Медведева (Главный)

/// Сколько рабочих минут заявке позволено оставаться нераспределённой.
/// Робот укладывался в секунды, так что десять минут — запас с избытком.
export const ASSIGN_LIMIT_MIN = 10;

export type SiteLead = {
  id: number;
  name: string;
  tags: string[];
  responsibleUserId: number | null;
};

/// Заявка с сайта: тег от интеграции либо узнаваемое название. Проверяем оба
/// признака — тег могут снять вручную, название переписать.
export function isSiteLead(lead: Pick<SiteLead, "name" | "tags">): boolean {
  if (lead.tags.some((tag) => tag.toLowerCase() === "tilda")) return true;
  return /^заявка с сайта/i.test(lead.name ?? "");
}

/// Нераспределённая: ответственный всё ещё приёмщик.
export function isUnassigned(lead: Pick<SiteLead, "responsibleUserId">): boolean {
  return lead.responsibleUserId === INTAKE_USER_ID;
}
