/// Клиент Profitbase API v4 — источник остатков, цен и статусов лотов.
///
/// Авторизация отдельным шагом: api_key меняется на access_token, который живёт
/// сутки и передаётся GET-параметром. Токен держим в памяти процесса и просим
/// новый заранее — сбор идёт минутами, и протухший посередине токен уронил бы
/// прогон на середине.
///
/// Лимит — не больше одного запроса в секунду на аккаунт. Он жёстче, чем у
/// amoCRM, поэтому пауза здесь заметная и её нельзя убирать «для скорости».

const MIN_INTERVAL_MS = 1100;
const MAX_ATTEMPTS = 4;
/// Токен живёт сутки; обновляем за час до конца.
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

let lastRequestAt = 0;
let token: { value: string; expiresAt: number } | null = null;

function config() {
  const account = process.env.PROFITBASE_ACCOUNT;
  const apiKey = process.env.PROFITBASE_API_KEY;

  if (!account || !apiKey) {
    throw new Error(
      "Не заданы PROFITBASE_ACCOUNT и PROFITBASE_API_KEY в .env.\n" +
        "Ключ берётся в кабинете Profitbase: Приложения → API Profitbase.\n" +
        "PROFITBASE_ACCOUNT — это часть адреса кабинета до .profitbase.ru, например pb1234.",
    );
  }

  return { base: `https://${normalizeAccount(account)}.profitbase.ru/api/v4/json`, apiKey };
}

/// В .env попадает то целый адрес кабинета, то поддомен. Приводим к одному виду —
/// иначе запрос уходит в никуда и падает с невнятной сетевой ошибкой.
export function normalizeAccount(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.profitbase\.ru$/i, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function authenticate(): Promise<string> {
  const { base, apiKey } = config();
  await throttle();

  const response = await fetch(`${base}/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "api-app", credentials: { pb_api_key: apiKey } }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Profitbase не принял ключ (${response.status}). Проверьте PROFITBASE_API_KEY и то, ` +
          `что IP этой машины добавлен в список разрешённых в кабинете. Ответ: ${body}`,
      );
    }
    throw new Error(`Profitbase ответил ${response.status} на авторизацию: ${body}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Profitbase не вернул access_token — проверьте тип приложения и ключ.");
  }

  token = { value: data.access_token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token.value;
}

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.value;
  return authenticate();
}

export async function pbGet<T>(
  path: string,
  query: Record<string, string | number | boolean> = {},
): Promise<T> {
  const { base } = config();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const params = new URLSearchParams({ access_token: await accessToken() });
    for (const [key, value] of Object.entries(query)) params.set(key, String(value));

    await throttle();

    let response: Response;
    try {
      response = await fetch(`${base}${path}?${params}`);
    } catch (cause) {
      const reason = cause instanceof Error ? (cause.cause as { code?: string })?.code ?? cause.message : String(cause);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Не удалось соединиться с Profitbase (${reason}). Проверьте PROFITBASE_ACCOUNT.`);
      }
      await sleep(attempt * 1000);
      continue;
    }

    if (response.ok) return (await response.json()) as T;

    // Токен мог протухнуть раньше срока — тогда получаем новый и повторяем.
    if (response.status === 401 && attempt < MAX_ATTEMPTS) {
      token = null;
      continue;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `Profitbase ответил ${response.status} на ${path}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    await sleep(attempt * 1000);
  }

  throw new Error(`Profitbase: не удалось получить ${path} за ${MAX_ATTEMPTS} попытки`);
}
