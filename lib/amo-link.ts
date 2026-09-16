import { normalizeSubdomain } from "./amo";

/// Ссылка на карточку сделки в amoCRM.
///
/// Пульт не хранит телефоны и имена покупателей: провалившись в список,
/// человек открывает карточку в самой CRM, где права уже настроены.
/// Так персональные данные остаются в одном месте, а не в двух.
export function leadUrl(leadId: number): string | null {
  const subdomain = process.env.AMO_SUBDOMAIN;
  if (!subdomain) return null;
  return `https://${normalizeSubdomain(subdomain)}.amocrm.ru/leads/detail/${leadId}`;
}
