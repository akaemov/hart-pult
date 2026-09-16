/// Клиент amoCRM API v4 на долгосрочном токене.
///
/// Долгосрочный токен выдаётся в карточке приватной интеграции и живёт годами —
/// в отличие от связки access/refresh, где refresh одноразовый и его потеря
/// означает переподключение интеграции. Поэтому здесь токен просто лежит
/// в переменной окружения, а в базе не хранится ничего.
///
/// Ограничение amoCRM — 7 запросов в секунду на аккаунт. Клиент держит паузу
/// между запросами и уважает Retry-After: превышение лимита блокирует
/// интеграцию, а не просто возвращает ошибку.

const MIN_INTERVAL_MS = 250;
const MAX_ATTEMPTS = 4;

let lastRequestAt = 0;

/// В .env регулярно попадает не поддомен, а целый адрес кабинета —
/// «https://example.amocrm.ru/». Приводим к одному слову: иначе запрос уходит
/// на https://https://example.amocrm.ru.amocrm.ru и падает с «fetch failed»,
/// где про настоящую причину не сказано ни слова.
export function normalizeSubdomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.amocrm\.(ru|com)$/i, "");
}

function config() {
  const subdomain = process.env.AMO_SUBDOMAIN;
  const token = process.env.AMO_LONG_LIVED_TOKEN;

  if (!subdomain || !token) {
    throw new Error(
      "Не заданы AMO_SUBDOMAIN и AMO_LONG_LIVED_TOKEN в .env.\n" +
        "Токен берётся в amoCRM: Настройки → Интеграции → ваша интеграция → Ключи и доступы.",
    );
  }

  return { subdomain: normalizeSubdomain(subdomain), token };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// Значения query: массивы и объекты разворачиваются в скобочный синтаксис
/// amoCRM — filter[created_at][from]=..., filter[pipeline_id][0]=...
type QueryValue = string | number | QueryValue[] | { [key: string]: QueryValue };

function appendQuery(params: URLSearchParams, key: string, value: QueryValue) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendQuery(params, `${key}[${index}]`, item));
  } else if (typeof value === "object") {
    for (const [name, item] of Object.entries(value)) {
      appendQuery(params, `${key}[${name}]`, item);
    }
  } else {
    params.set(key, String(value));
  }
}

export function buildQuery(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) appendQuery(params, key, value);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/// GET к API. Возвращает null на 204 No Content — так amoCRM отвечает,
/// когда под фильтр не попало ничего. Это не ошибка и не пустой список.
export async function amoGet<T>(
  path: string,
  query: Record<string, QueryValue> = {},
): Promise<T | null> {
  const { subdomain, token } = config();
  const url = `https://${subdomain}.amocrm.ru${path}${buildQuery(query)}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    // Обрыв соединения на длинной выгрузке — обычное дело: тысячи запросов
    // подряд, и любой из них может оборваться. fetch бросает исключение,
    // а не возвращает ответ, поэтому повтор нужен отдельной веткой.
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (cause) {
      const reason = cause instanceof Error ? (cause.cause as { code?: string })?.code ?? cause.message : String(cause);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Не удалось соединиться с https://${subdomain}.amocrm.ru (${reason}). ` +
            "Проверьте AMO_SUBDOMAIN — это одно слово без https:// и без .amocrm.ru.",
        );
      }
      await sleep(attempt * 1000);
      continue;
    }

    if (response.status === 204) return null;
    if (response.ok) return (await response.json()) as T;

    if (response.status === 401) {
      throw new Error(
        "amoCRM отвечает 401. Токен неверен, отозван или интеграции не выданы права на нужные разделы.",
      );
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `amoCRM ответила ${response.status} на ${path}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    const retryAfter = Number(response.headers.get("Retry-After"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 1000);
  }

  throw new Error(`amoCRM: не удалось получить ${path} за ${MAX_ATTEMPTS} попытки`);
}

type Page<T> = {
  _embedded?: Record<string, T[]>;
  _page?: number;
};

/// Постраничный обход коллекции. `collection` — ключ внутри _embedded
/// («leads», «notes», «custom_fields»).
export async function* amoList<T>(
  path: string,
  collection: string,
  query: Record<string, QueryValue> = {},
  limit = 250,
): AsyncGenerator<T> {
  for (let page = 1; ; page++) {
    const data = await amoGet<Page<T>>(path, { ...query, page, limit });
    const items = data?._embedded?.[collection];
    if (!items || items.length === 0) return;

    for (const item of items) yield item;
    if (items.length < limit) return;
  }
}

export type AmoLead = {
  id: number;
  name: string;
  created_at: number;
  responsible_user_id: number;
  status_id: number;
  pipeline_id: number;
  custom_fields_values: { field_id: number; field_name: string; values: { value: unknown }[] }[] | null;
  _embedded?: { contacts?: { id: number }[] };
};

export type AmoNote = {
  id: number;
  entity_id: number;
  created_at: number;
  note_type: string;
  params?: { duration?: number; phone?: string; source?: string };
};

export type AmoCustomField = { id: number; name: string; type: string };

export type AmoUser = { id: number; name: string };
