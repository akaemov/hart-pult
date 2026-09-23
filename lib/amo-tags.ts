/// Разбор тегов amoCRM: что из них переносится в поля, а что требует решения.
///
/// В аккаунте 37 живых тегов, и они смешивают три разные вещи: объект («#заря»),
/// источник обращения («#агентство», «tilda») и тип помещения («2 кк», «Паркинг»).
/// Первые два — это поля, которые пульт умеет считать; третье полем не является
/// и остаётся тегом.
///
/// Правила заданы здесь, а не в скрипте: скрипт правит чужую CRM, и то, что
/// именно он туда пишет, должно читаться одним списком и проверяться тестами.

/// Тег объекта → значение текстового поля «ЖК».
const OBJECTS: Record<string, string> = {
  "заря": "Заря",
  "пьермонт": "Пьермонт",
  "ураксина": "Ураксина",
};

/// Тег источника → значение списка «Источник заявки».
///
/// Источник — это канал привлечения, а не инструмент захвата. Поэтому «tilda»,
/// «marquiz», «ReQuest» и чат-лендинг — всё это «Сайт»: форма на сайте меняется
/// каждый год, а канал остаётся. Если писать в источник инструмент, канал
/// теряется совсем, и восстановить его будет неоткуда.
const SOURCES: Record<string, string> = {
  "агентство": "Риелтор",
  "пешеход": "Пешеход",

  // Сайт и всё, чем на нём ловят заявку.
  "сайт": "Сайт",
  "tilda": "Сайт",
  "marquiz": "Сайт",
  "request": "Сайт",
  "чат-лендинг": "Сайт",
  // Коллтрекинг подменяет номер на сайте — значит, звонок пришёл оттуда же.
  "callmagnet": "Сайт",

  "яндекс.директ": "Яндекс.Директ",
  "instagram": "Instagram",
  "telegram": "Telegram",
  "whatsapp": "WhatsApp",
  "вк": "ВКонтакте",
  "vknew": "ВКонтакте",
  "авито": "Авито",
  "авито2": "Авито",
  "выставка": "Выставка",
};

/// Теги, которые пишутся по шаблону, а не списком.
const PATTERNS: { test: RegExp; kind: "object" | "source"; value: string }[] = [
  // Интеграция Wazzup метит сделки именем подключённого аккаунта:
  // «WZ (HART development)», «WZ (79997575499)».
  { test: /^wz\s*\(/i, kind: "source", value: "WhatsApp" },
  // Метка кампании ВК: «vk_238211713_1».
  { test: /^vk[_\d]/i, kind: "source", value: "ВКонтакте" },
  // Опечатка в теге объекта. Три сделки, но они существуют.
  { test: /^зара$/i, kind: "object", value: "Заря" },
];

/// Теги, которые полем не являются: тип помещения, этап работы, признак сделки.
/// Их не переносят и не удаляют — это отдельный разговор с отделом продаж.
const NOT_A_FIELD =
  /^(\d+\s*\+|\d+\s*кк?|студия|паркинг|кладовая|терраса|урбан-виллы|коммерция|презентация|экскурсия|безпв|бпв|№трейдин|импорт_[\d_]+)$/i;

/// Значения, которых в справочнике amoCRM нет и которые скрипт заводит сам.
/// Порядок — как в отчёте: сначала то, что приносит больше заявок.
export const NEW_SOURCE_OPTIONS = [
  "Яндекс.Директ",
  "Instagram",
  "ВКонтакте",
  "WhatsApp",
  "Авито",
  "Telegram",
  "Выставка",
];

export type TagVerdict =
  | { kind: "object"; value: string }
  | { kind: "source"; value: string }
  | { kind: "not-a-field" }
  | { kind: "undecided" };

/// Тег приходит с решёткой и в разном регистре: «#Заря», «#заря», «ЗАРЯ».
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "").trim().toLowerCase();
}

export function classifyTag(tag: string): TagVerdict {
  const key = normalizeTag(tag);

  if (OBJECTS[key]) return { kind: "object", value: OBJECTS[key] };
  if (SOURCES[key]) return { kind: "source", value: SOURCES[key] };
  if (NOT_A_FIELD.test(key)) return { kind: "not-a-field" };

  const pattern = PATTERNS.find((item) => item.test.test(key));
  if (pattern) return { kind: pattern.kind, value: pattern.value };

  return { kind: "undecided" };
}

/// Лестница источников: чем выше, тем вернее ответ на вопрос «откуда пришёл».
///
/// У сделки часто висят два тега сразу — «Яндекс.Директ» и «WhatsApp», —
/// и это не противоречие: канал привёл, мессенджер принял разговор. Побеждает
/// канал: где говорили, видно и так, а откуда пришли, кроме этого тега,
/// узнать неоткуда.
///
/// «Риелтор» в лестницу не входит намеренно. Сделка, помеченная и агентством,
/// и сайтом, — это открытый вопрос РОПа, а не задача для скрипта.
const SOURCE_PRIORITY = [
  ["Яндекс.Директ", "Авито", "Выставка"],
  ["Instagram", "ВКонтакте", "Telegram", "WhatsApp"],
  ["Сайт", "Пешеход"],
];

/// Один источник из нескольких — или null, если выбор неочевиден.
export function resolveSource(values: string[]): string | null {
  const unique = [...new Set(values)];
  if (unique.length <= 1) return unique[0] ?? null;

  // Значение вне лестницы — «Риелтор» — не проигрывает молча: спор с ним
  // не решается приоритетом вовсе.
  const ranked = SOURCE_PRIORITY.flat();
  if (unique.some((value) => !ranked.includes(value))) return null;

  for (const tier of SOURCE_PRIORITY) {
    const hit = unique.filter((value) => tier.includes(value));
    // Два тега одного уровня — например, Instagram и Telegram — лестница
    // не разводит: они равны, и выбирать за менеджера здесь нечего.
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) return null;
  }

  return null;
}

export type LeadTags = { id: number; tags: string[]; object: string | null; source: string | null };

export type Conflict = { field: "ЖК" | "Источник заявки"; values: string[] };

/// Поля разбираются независимо: спор об источнике не отменяет перенос объекта.
/// Раньше отменял — и две с лишним тысячи сделок теряли «ЖК» из-за тега,
/// который к объекту отношения не имеет.
export type Plan = {
  object: string | null;
  source: string | null;
  conflicts: Conflict[];
};

/// Что делать с одной сделкой.
///
/// Заполненное поле не трогаем никогда: человек мог поставить значение руками,
/// и оно вернее тега. Два разных объекта в тегах — это не ответ, а вопрос
/// к менеджеру: такое поле остаётся пустым и попадает в отчёт.
export function planLead(lead: LeadTags): Plan {
  const verdicts = lead.tags.map(classifyTag);

  const objects = [...new Set(verdicts.flatMap((v) => (v.kind === "object" ? [v.value] : [])))];
  const sources = [...new Set(verdicts.flatMap((v) => (v.kind === "source" ? [v.value] : [])))];

  const conflicts: Conflict[] = [];

  let object: string | null = null;
  if (objects.length === 1) object = objects[0];
  if (objects.length > 1) conflicts.push({ field: "ЖК", values: objects });

  let source: string | null = null;
  if (sources.length > 0) {
    source = resolveSource(sources);
    if (source === null) conflicts.push({ field: "Источник заявки", values: sources });
  }

  return {
    object: lead.object === null ? object : null,
    source: lead.source === null ? source : null,
    conflicts,
  };
}
