import { ACCOUNTS, avitoGet, avitoPages, fetchFeed, type Account } from "../avito";
import { parseFeed } from "../avito-feed";
import { prisma } from "../prisma";
import { withRetry } from "./retry";
import type { Collector, SyncContext } from "./run";

/// Сбор по Авито: фид Profitbase, отчёт автозагрузки и то, что реально
/// опубликовано в кабинете.
///
/// Три источника вместо одного, потому что расхождения живут именно между ними:
/// лот есть в фиде, но не доехал до Авито; объявление висит на Авито, а из фида
/// пропало; цена в фиде одна, в объявлении другая. Из одного источника ни одно
/// из этих расхождений не видно.
///
/// Период сбору не нужен: и фид, и кабинет — срез на сейчас, истории у них нет.

const CHUNK = 100;
const TX = { timeout: 180_000, maxWait: 120_000 };

/// Сколько лотов спрашиваем одним запросом про их номера на Авито. Двести
/// проходят, весь «Пьермонт» целиком (252) тоже — но запас оставлен: адрес
/// с тысячей id рискует упереться в длину строки запроса.
const MATCH_CHUNK = 200;

/// Отчёт автозагрузки отдаёт строго по двадцать строк на страницу, сколько
/// ни проси. Просить больше нельзя: номер страницы считается от запрошенного
/// размера, и половина отчёта уходит в пропущенные окна.
const REPORT_PAGE = 20;

type UploadStats = { title?: string; slug?: string; count?: number; sections?: UploadStats[] };

type Upload = {
  upload_id: number;
  status: string;
  started_at?: string;
  stats?: UploadStats;
};

type ReportItem = {
  ad_id: string;
  section?: { slug?: string; title?: string };
  messages?: { code?: number; title?: string; description?: string; type?: string }[];
};

type Match = { ad_id: string; avito_id: number | null };

type CoreItem = {
  id: number;
  title?: string;
  address?: string;
  price?: number;
  status?: string;
  url?: string;
};

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/// Из сообщений автозагрузки храним ошибки и предупреждения. Info — это
/// «объявление активировалось» на каждом лоте: шум, который раздувает базу
/// и ничего не объясняет.
function keptMessages(item: ReportItem) {
  return (item.messages ?? [])
    .filter((message) => message.type === "error" || message.type === "warning")
    .map((message) => ({
      code: message.code ?? null,
      type: message.type ?? "error",
      // Авито кладёт в title ссылку на описание формата — тег в таблице пульта
      // не нужен, а текст внутри нужен.
      title: (message.title ?? "").replace(/<[^>]+>/g, "").trim(),
      detail: (message.description ?? "").trim(),
    }));
}

/// Номер объявления на Авито для каждого лота из фида.
///
/// Берётся отдельным запросом, а не из постраничного отчёта автозагрузки:
/// страницы отчёта не держат порядок — один и тот же лот приходит на двух
/// страницах, а другой не приходит ни на одной, и состав каждый раз разный.
/// Здесь ответ точный: спросили про 252 лота — получили 252 строки.
async function matchAvitoIds(account: Account, adIds: string[]): Promise<Map<string, number>> {
  const matched = new Map<string, number>();

  for (const batch of chunked(adIds, MATCH_CHUNK)) {
    const body = await avitoGet<{ items?: Match[] }>(account, "/autoload/v2/items/avito_ids", {
      query: batch.join(","),
    });
    for (const item of body.items ?? []) {
      if (item.avito_id) matched.set(item.ad_id, item.avito_id);
    }
  }

  return matched;
}

async function collectAccount(ctx: SyncContext, account: Account): Promise<number> {
  const ads = parseFeed(await fetchFeed(account));
  await ctx.saveRaw(`feed:${account.id}`, { count: ads.length, ads });

  // Последние прогоны автозагрузки: по ним видно, когда Авито вообще забирал
  // фид и сколько лотов приняло.
  const uploads = await avitoGet<{ uploads?: Upload[] }>(account, "/autoload/v4/uploads", {
    per_page: 5,
    page: 1,
  });
  await ctx.saveRaw(`uploads:${account.id}`, { uploads: uploads.uploads ?? [] });

  const matched = await matchAvitoIds(
    account,
    ads.map((ad) => ad.adId),
  );

  // Из отчёта берём только строки с ошибками: остальное — «без изменений»
  // на каждый лот, а это и так видно по тому, что объявление опубликовано.
  const failures: ReportItem[] = [];
  for await (const item of avitoPages<ReportItem>(
    account,
    "/autoload/v4/uploads/last_successful/items",
    (body) => body.items as ReportItem[] | undefined,
    { sections: "error" },
    REPORT_PAGE,
  )) {
    failures.push(item);
  }
  await ctx.saveRaw(`errors:${account.id}`, { count: failures.length, items: failures });

  const published: CoreItem[] = [];
  for await (const item of avitoPages<CoreItem>(
    account,
    "/core/v1/items",
    (body) => body.resources as CoreItem[] | undefined,
  )) {
    published.push(item);
  }
  await ctx.saveRaw(`items:${account.id}`, { count: published.length });

  const failureByAd = new Map(failures.map((item) => [item.ad_id, item]));
  const adRows = ads.map((ad) => {
    const failure = failureByAd.get(ad.adId);
    return {
      account: account.id,
      adId: ad.adId,
      rooms: ad.rooms,
      square: ad.square,
      livingSpace: ad.livingSpace,
      floor: ad.floor,
      price: ad.price,
      inFeed: true,
      sectionSlug: failure?.section?.slug ?? null,
      sectionTitle: failure?.section?.title ?? null,
      messages: failure ? keptMessages(failure) : [],
      avitoId: matched.has(ad.adId) ? BigInt(matched.get(ad.adId)!) : null,
      avitoStatus: null,
      url: null,
    };
  });

  for (const batch of chunked(adRows)) {
    await withRetry("запись лотов", () =>
      prisma.$transaction(
        batch.map((data) =>
          prisma.avitoAd.upsert({
            where: { account_adId: { account: account.id, adId: data.adId } },
            create: data,
            update: data,
          }),
        ),
        TX,
      ),
    );
  }

  // Лот, которого в фиде больше нет, не удаляем: его объявление может висеть
  // на Авито, и это как раз то, что ищем. Помечаем, что из выгрузки он ушёл.
  await prisma.avitoAd.updateMany({
    where: { account: account.id, adId: { notIn: adRows.map((row) => row.adId) } },
    data: { inFeed: false, sectionSlug: null, sectionTitle: null, messages: [] },
  });

  const itemRows = published.map((item) => ({
    account: account.id,
    avitoId: BigInt(item.id),
    title: item.title ?? "",
    address: item.address ?? "",
    price: item.price ?? null,
    status: item.status ?? "",
    url: item.url ?? "",
  }));

  for (const batch of chunked(itemRows)) {
    await withRetry("запись объявлений", () =>
      prisma.$transaction(
        batch.map((data) =>
          prisma.avitoItem.upsert({
            where: { account_avitoId: { account: account.id, avitoId: data.avitoId } },
            create: data,
            update: data,
          }),
        ),
        TX,
      ),
    );
  }

  // Снятое объявление кабинет больше не отдаёт — и в пульте его быть не должно:
  // это срез на сейчас, а не история.
  await prisma.avitoItem.deleteMany({
    where: { account: account.id, avitoId: { notIn: itemRows.map((row) => row.avitoId) } },
  });

  return adRows.length + itemRows.length;
}

export function avitoCollector(): Collector {
  return async (ctx: SyncContext) => {
    let rows = 0;
    for (const account of ACCOUNTS) {
      rows += await collectAccount(ctx, account);
    }
    return { rows };
  };
}
