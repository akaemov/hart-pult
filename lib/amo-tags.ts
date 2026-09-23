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

/// Тег источника → значение списка «Источник заявки», как оно заведено в amoCRM.
/// Здесь только однозначные соответствия: остальные теги возвращаются как
/// требующие решения, а не раскладываются наугад в «Другое».
const SOURCES: Record<string, string> = {
  "агентство": "Риелтор",
  "сайт": "Сайт",
  "tilda": "Сайт",
  "пешеход": "Пешеход",
};

/// Теги, которые полем не являются: тип помещения, этап работы, признак сделки.
/// Их не переносят и не удаляют — это отдельный разговор с отделом продаж.
const NOT_A_FIELD =
  /^(\d+\s*\+|\d+\s*кк?|студия|паркинг|кладовая|терраса|урбан-виллы|коммерция|презентация|экскурсия|безпв|бпв|№трейдин)$/i;

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

  return { kind: "undecided" };
}

export type LeadTags = { id: number; tags: string[]; object: string | null; source: string | null };

export type Plan =
  | { kind: "skip"; reason: "нет подходящих тегов" | "поля уже заполнены" }
  | { kind: "conflict"; field: "ЖК" | "Источник заявки"; values: string[] }
  | { kind: "write"; object: string | null; source: string | null };

/// Что делать с одной сделкой.
///
/// Заполненное поле не трогаем никогда: человек мог поставить значение руками,
/// и оно вернее тега. Два разных объекта в тегах — это не ответ, а вопрос
/// к менеджеру: такую сделку скрипт обходит стороной и называет в отчёте.
export function planLead(lead: LeadTags): Plan {
  const verdicts = lead.tags.map(classifyTag);

  const objects = [...new Set(verdicts.flatMap((v) => (v.kind === "object" ? [v.value] : [])))];
  const sources = [...new Set(verdicts.flatMap((v) => (v.kind === "source" ? [v.value] : [])))];

  if (objects.length > 1) return { kind: "conflict", field: "ЖК", values: objects };
  if (sources.length > 1) return { kind: "conflict", field: "Источник заявки", values: sources };
  if (objects.length === 0 && sources.length === 0) return { kind: "skip", reason: "нет подходящих тегов" };

  const object = lead.object === null && objects.length === 1 ? objects[0] : null;
  const source = lead.source === null && sources.length === 1 ? sources[0] : null;

  if (object === null && source === null) return { kind: "skip", reason: "поля уже заполнены" };

  return { kind: "write", object, source };
}
