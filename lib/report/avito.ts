import "server-only";
import { ACCOUNTS } from "../avito";
import { checkAccount, type AccountCheck, type CheckAd, type CheckItem, type Message } from "../avito-check";
import { prisma } from "../prisma";

/// Сверка Авито по обоим объектам. Числа берутся из последнего сбора:
/// и фид, и кабинет — срез на сейчас, поэтому период здесь не нужен.
///
/// BigInt превращается в строку прямо здесь: номер объявления на Авито
/// не помещается в обычное число JavaScript, а считать по нему ничего
/// не нужно — только сопоставлять и показывать ссылкой.

export type AvitoReport = {
  accounts: AccountCheck[];
  lastUploadAt: Date | null;
};

export async function avitoReport(): Promise<AvitoReport> {
  const [ads, items, lastRun] = await Promise.all([
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

    return checkAccount(account.object, accountAds, accountItems);
  });

  return { accounts, lastUploadAt: lastRun?.finishedAt ?? null };
}
