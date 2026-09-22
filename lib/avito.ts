/// Клиент Авито API и фидов Profitbase.
///
/// Аккаунта два — у «Зари» и «Пьермонта» свои кабинеты, свои ключи и свой фид.
/// Поэтому всё здесь параметризовано аккаунтом, а токены лежат по одному на
/// аккаунт: один токен на оба кабинета не работает, это разные юрлица внутри
/// одной компании.
///
/// Авторизация — client_credentials, токен живёт сутки. Обновляем за час до
/// конца: прогон идёт минутами, и протухший посередине токен уронил бы сбор.

const MIN_INTERVAL_MS = 250;
const MAX_ATTEMPTS = 6;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const API = "https://api.avito.ru";

export type AccountId = "zarya" | "piermont";

export type Account = {
  id: AccountId;
  /// Название объекта так, как его зовут в компании.
  object: string;
  /// Префикс переменных окружения: AVITO_ZARYA_CLIENT_ID и так далее.
  env: string;
};

export const ACCOUNTS: readonly Account[] = [
  { id: "zarya", object: "Заря", env: "AVITO_ZARYA" },
  { id: "piermont", object: "Пьермонт", env: "AVITO_PIERMONT" },
];

export function accountById(id: string): Account | undefined {
  return ACCOUNTS.find((account) => account.id === id);
}

const tokens = new Map<AccountId, { value: string; expiresAt: number }>();
/// До какого момента аккаунту запрещено слать запросы. Лимит у Авито свой на
/// каждую группу эндпоинтов — отчёт автозагрузки отдаёт всего 10 запросов
/// за раз, а страниц в нём бывает и тридцать.
const pausedUntil = new Map<AccountId, number>();
let lastRequestAt = 0;

function credentials(account: Account) {
  const clientId = process.env[`${account.env}_CLIENT_ID`];
  const clientSecret = process.env[`${account.env}_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    throw new Error(
      `Не заданы ${account.env}_CLIENT_ID и ${account.env}_CLIENT_SECRET в .env.\n` +
        "Ключи берутся в кабинете Авито: Профиль → Настройки → API.",
    );
  }

  return { clientId, clientSecret };
}

/// Адрес фида Profitbase для объекта. Фид открыт, но в публичный репозиторий
/// его адрес не кладём: по нему видно весь остаток с ценами.
export function feedUrl(account: Account): string {
  const url = process.env[`${account.env}_FEED_URL`];
  if (!url) {
    throw new Error(
      `Не задан ${account.env}_FEED_URL в .env.\n` +
        "Это адрес выгрузки для Авито из кабинета Profitbase: Настройки → Выгрузки.",
    );
  }
  return url;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(account?: Account) {
  const paused = account ? (pausedUntil.get(account.id) ?? 0) : 0;
  const wait = Math.max(lastRequestAt + MIN_INTERVAL_MS, paused) - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/// Сколько секунд Авито просит подождать. Заголовок свой, нестандартный;
/// Retry-After тоже встречается, поэтому смотрим оба.
function retryAfterMs(response: Response): number {
  const seconds = Number(
    response.headers.get("x-ratelimit-retry-after") ?? response.headers.get("retry-after") ?? 0,
  );
  return Number.isFinite(seconds) && seconds > 0 ? (seconds + 1) * 1000 : 5000;
}

/// Квота кончилась — дальше идти нельзя, даже если этот запрос прошёл.
/// Дожидаемся окна здесь, а не ловим 429 на следующей странице.
function noteRateLimit(account: Account, response: Response) {
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    pausedUntil.set(account.id, Date.now() + retryAfterMs(response));
  }
}

async function authenticate(account: Account): Promise<string> {
  const { clientId, clientSecret } = credentials(account);
  await throttle();

  const response = await fetch(`${API}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(
      `Авито не выдал токен для «${account.object}» (${response.status}). ` +
        `Проверьте ${account.env}_CLIENT_ID и ${account.env}_CLIENT_SECRET. Ответ: ${body}`,
    );
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error(`Авито не вернул access_token для «${account.object}».`);
  }

  tokens.set(account.id, { value: data.access_token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return data.access_token;
}

async function accessToken(account: Account): Promise<string> {
  const known = tokens.get(account.id);
  if (known && known.expiresAt > Date.now()) return known.value;
  return authenticate(account);
}

export async function avitoGet<T>(
  account: Account,
  path: string,
  query: Record<string, string | number> = {},
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  const url = `${API}${path}${params.toString() ? `?${params}` : ""}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await throttle(account);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${await accessToken(account)}` },
      });
    } catch (cause) {
      const reason =
        cause instanceof Error ? ((cause.cause as { code?: string })?.code ?? cause.message) : String(cause);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Не удалось соединиться с Авито (${reason}) на ${path}.`);
      }
      await sleep(attempt * 1000);
      continue;
    }

    if (response.ok) {
      noteRateLimit(account, response);
      return (await response.json()) as T;
    }

    // Токен мог протухнуть раньше срока — берём новый и повторяем.
    if (response.status === 401 && attempt < MAX_ATTEMPTS) {
      tokens.delete(account.id);
      continue;
    }

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterMs(response));
      continue;
    }

    if (response.status < 500 || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `Авито ответил ${response.status} на ${path}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    await sleep(attempt * 1000);
  }

  throw new Error(`Авито: не удалось получить ${path} за ${MAX_ATTEMPTS} попытки`);
}

/// Страницы Авито. Размер страницы приходится брать из ответа, а не из
/// запроса: отчёт автозагрузки молча режет per_page до 20 и сообщает об этом
/// в meta.perPage. Считать страницу последней по «пришло меньше, чем просили»
/// нельзя — так теряется всё после первых двадцати строк.
export async function* avitoPages<T>(
  account: Account,
  path: string,
  pick: (body: Record<string, unknown>) => T[] | undefined,
  query: Record<string, string | number> = {},
  perPage = 100,
): AsyncGenerator<T> {
  // Предохранитель от бесконечного обхода, если Авито перестанет отдавать meta
  // и начнёт возвращать одну и ту же страницу.
  const MAX_PAGES = 500;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await avitoGet<Record<string, unknown>>(account, path, {
      ...query,
      per_page: perPage,
      page,
    });
    const items = pick(body) ?? [];
    for (const item of items) yield item;

    if (items.length === 0) return;

    const meta = body.meta as { pages?: number; perPage?: number; per_page?: number } | undefined;
    if (meta?.pages) {
      if (page >= meta.pages) return;
      continue;
    }

    const size = meta?.perPage ?? meta?.per_page ?? perPage;
    if (items.length < size) return;
  }
}

/// Фид Profitbase: открытый XML, авторизация не нужна. Выгрузка на пару сотен
/// лотов весит под мегабайт и отдаётся секунд за десять.
export async function fetchFeed(account: Account): Promise<string> {
  const response = await fetch(feedUrl(account), { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(
      `Фид «${account.object}» отдал ${response.status}. Проверьте ${account.env}_FEED_URL ` +
        "и то, что выгрузка в Profitbase включена.",
    );
  }
  return response.text();
}
