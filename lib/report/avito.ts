import "server-only";
import { ACCOUNTS } from "../avito";
import { checkAccount, type AccountCheck, type CheckAd, type CheckItem, type Message } from "../avito-check";
import { prisma } from "../prisma";
import { checkStock, type LiveAd, type StockCheck, type StockLot } from "../stock-check";
import { normalizeProject } from "../stock-pairs";

/// Сверка Авито по обоим объектам. Числа берутся из последнего сбора:
/// и фид, и кабинет — срез на сейчас, поэтому период здесь не нужен.
///
/// BigInt превращается в строку прямо здесь: номер объявления на Авито
/// не помещается в обычное число JavaScript, а считать по нему ничего
/// не нужно — только сопоставлять и показывать ссылкой.

/// Сверка по объекту плюс то, что показали остатки: объявления на квартиры,
/// которые в основном проекте Profitbase уже не продаются.
export type AccountReport = AccountCheck & { stock: StockCheck };

export type AvitoReport = {
  accounts: AccountReport[];
  lastUploadAt: Date | null;
  /// Есть ли вообще остатки в базе. Без них окно «продано, а висит» не пустое,
  /// а неизвестное — и говорить об этом надо по-разному.
  hasStock: boolean;
};

export async function avitoReport(): Promise<AvitoReport> {
  const [ads, items, lots, lastRun] = await Promise.all([
    prisma.avitoAd.findMany({
      select: {
        account: true,
        adId: true,
        rooms: true,
        square: true,
        livingSpace: true,
        floor: true,
        price: true,
        inFeed: true,
        messages: true,
        avitoId: true,
      },
    }),
    prisma.avitoItem.findMany({
      select: { account: true, avitoId: true, title: true, address: true, price: true, status: true, url: true },
    }),
    prisma.property.findMany({
      select: {
        id: true,
        projectName: true,
        houseName: true,
        number: true,
        floor: true,
        rooms: true,
        areaTotal: true,
        status: true,
        price: true,
      },
    }),
    prisma.syncRun.findFirst({
      where: { source: "avito", status: "SUCCESS" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  const accounts = ACCOUNTS.map((account) => {
    const accountAds: CheckAd[] = ads
      .filter((ad) => ad.account === account.id)
      .map((ad) => ({
        adId: ad.adId,
        rooms: ad.rooms,
        square: ad.square,
        livingSpace: ad.livingSpace,
        floor: ad.floor,
        price: ad.price,
        inFeed: ad.inFeed,
        messages: (ad.messages ?? []) as Message[],
        avitoId: ad.avitoId === null ? null : String(ad.avitoId),
      }));

    const accountItems: CheckItem[] = items
      .filter((item) => item.account === account.id)
      .map((item) => ({
        avitoId: String(item.avitoId),
        title: item.title,
        address: item.address,
        price: item.price,
        status: item.status,
        url: item.url,
      }));

    const check = checkAccount(account.object, accountAds, accountItems);

    // Лоты объекта — и основного проекта, и копии «ДЛЯ АВИТО»: сверка живёт
    // ровно на разнице между ними.
    const key = normalizeProject(account.object);
    const accountLots: StockLot[] = lots.filter((lot) => normalizeProject(lot.projectName) === key);

    // Проверяем только то, что сейчас висит на Авито: лот, который не доехал
    // до публикации, покупателю не показывается, и его статус здесь не важен.
    const publishedItems = new Set(accountItems.map((item) => item.avitoId));
    const live: LiveAd[] = accountAds
      .filter((ad) => ad.inFeed && ad.avitoId !== null && publishedItems.has(ad.avitoId))
      .map((ad) => {
        const item = accountItems.find((candidate) => candidate.avitoId === ad.avitoId);
        return {
          adId: ad.adId,
          avitoId: ad.avitoId,
          url: item?.url ?? null,
          price: item?.price ?? ad.price,
        };
      });

    return { ...check, stock: checkStock(account.object, accountLots, live) };
  });

  return {
    accounts,
    lastUploadAt: lastRun?.finishedAt ?? null,
    hasStock: lots.length > 0,
  };
}
