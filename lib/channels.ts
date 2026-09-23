/// Правила, по которым сделка относится к объекту и к каналу.
///
/// Живут в одном месте и покрыты тестами: как только «Риелтор → Фиксации от
/// агентств» появится в двух местах, выгрузка в таблицу и пульт разойдутся,
/// и доказать, какие цифры верны, будет нечем.
///
/// Неизвестное значение всегда падает в «источник не указан», а не в «прочие»:
/// прочие — это канал, а не указан — дыра в данных, и путать их нельзя.

export const OBJECTS = ["Заря", "Пьермонт", "Ураксина", "Не определён"] as const;
export type ObjectName = (typeof OBJECTS)[number];

/// Порядок повторяет строки вкладки «2. Лиды по источникам».
export const CHANNELS = [
  "Диджитал (Директ / VK / соцсети)",
  "Avito",
  "ЦИАН",
  "Домклик",
  "Сайт / прямые обращения",
  "Наружка / офлайн",
  "Сарафан / реферал",
  "Прочие источники",
  "Фиксации от агентств",
  "Источник не указан",
] as const;
export type Channel = (typeof CHANNELS)[number];

export type LeadMarks = {
  name: string | null;
  /// Значение поля «ЖК» из amoCRM, как оно записано в карточке.
  objectLabel?: string | null;
  sourceLabel: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  referrer: string | null;
};

/// Написания объекта в поле «ЖК» разошлись: часть карточек заполняли руками
/// до переноса тегов, и там «ЖК Заря» и «ПьермÓнт» — с латинской O с ударением.
/// Пульт сводит их к одному имени, не трогая саму CRM.
function fromObjectField(value: string | null | undefined): ObjectName | null {
  const text = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (text === "") return null;

  if (/зар[яa]/.test(text)) return "Заря";
  if (/пьерм[оo]нт|пъермонт|pierm[оo]nt/.test(text)) return "Пьермонт";
  if (/ураксин/.test(text)) return "Ураксина";

  return null;
}

/// Объект определяется по полю «ЖК», а если оно пусто — по названию сделки,
/// лендингу и рекламной кампании. Поле стоит первым с 23.09.2026: до переноса
/// тегов оно было заполнено у 4% сделок и потому не использовалось, теперь —
/// у 43%, и оно вернее любых догадок. Если сделка помечена обоими объектами
/// сразу — это не ответ, а неопределённость.
export function detectObject(lead: LeadMarks): ObjectName {
  const field = fromObjectField(lead.objectLabel);
  if (field) return field;

  const name = (lead.name ?? "").toLowerCase();
  const zarya = /заря|zarya/.test(name);
  const piermont = /пьермонт|пъермонт|piermont/.test(name);
  if (zarya && !piermont) return "Заря";
  if (piermont && !zarya) return "Пьермонт";

  const referrer = (lead.referrer ?? "").toLowerCase();
  if (/zarya/.test(referrer)) return "Заря";
  if (/pjermont|piermont/.test(referrer)) return "Пьермонт";

  const campaign = (lead.utmCampaign ?? "").toLowerCase();
  if (/zarya/.test(campaign)) return "Заря";
  if (/pjermont|piermont|chatlanding|telegram_perform|poisk_brand/.test(campaign)) return "Пьермонт";

  return "Не определён";
}

/// Значения поля «Источник заявки», как они заведены в amoCRM.
const BY_SOURCE_LABEL: Record<string, Channel> = {
  "Риелтор": "Фиксации от агентств",
  "Сайт": "Сайт / прямые обращения",
  "Звонок": "Сайт / прямые обращения",
  "Пешеход": "Наружка / офлайн",
  "Рекомендация": "Сарафан / реферал",
  "Другое": "Прочие источники",
  "Avito": "Avito",
  "Авито": "Avito",
  "ЦИАН": "ЦИАН",
  "Циан": "ЦИАН",
  "Домклик": "Домклик",
  "ДомКлик": "Домклик",
};

export function detectChannel(lead: LeadMarks): Channel {
  const label = (lead.sourceLabel ?? "").trim();

  // Фиксация агентством сильнее метки: сделку ведёт риелтор, даже если
  // человек до этого пришёл по рекламе.
  if (BY_SOURCE_LABEL[label] === "Фиксации от агентств") return "Фиксации от агентств";

  if ((lead.utmSource ?? "").trim()) return "Диджитал (Директ / VK / соцсети)";

  return BY_SOURCE_LABEL[label] ?? "Источник не указан";
}
