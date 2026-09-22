/// Проверка «продано, а объявление висит».
///
/// Квартира считается проданной по основному проекту Profitbase — там её
/// отмечает отдел продаж. Объявление живёт от лота проекта-копии «ДЛЯ АВИТО»,
/// откуда кормится фид. Пока эти два списка ведутся порознь, каждая продажа
/// оставляет объявление в рекламе, и увидеть это можно только сопоставив их.
///
/// Считается здесь, без базы и без сети, — и проверяется тестами.

import { normalizeHouse, normalizeProject } from "./stock-pairs";

export type StockLot = {
  id: number;
  projectName: string;
  houseName: string;
  number: string;
  floor: number | null;
  rooms: number | null;
  areaTotal: number | null;
  status: string;
  price: number | null;
};

/// Объявление, которое сейчас висит на Авито, и лот фида, от которого оно живёт.
export type LiveAd = {
  /// <Id> фида, он же id лота в проекте-копии.
  adId: string;
  avitoId: string | null;
  url: string | null;
  price: number | null;
};

export type StaleAd = {
  adId: string;
  object: string;
  house: string;
  number: string;
  floor: number | null;
  rooms: number | null;
  areaTotal: number | null;
  /// Статус в основном проекте: SOLD, BOOKED, UNAVAILABLE.
  status: string;
  price: number | null;
  avitoId: string | null;
  url: string | null;
};

export type StockCheck = {
  /// Объявления на квартиры, которые в основном проекте уже не продаются.
  stale: StaleAd[];
  /// Лоты копии, которым не нашлось двойника в основном проекте: по ним
  /// сказать нечего, и молчать об этом нельзя.
  unmatched: number;
};

const ON_SALE = "AVAILABLE";

export const STATUS_LABELS: Record<string, string> = {
  SOLD: "продана",
  BOOKED: "забронирована",
  UNAVAILABLE: "снята с продажи",
  AVAILABLE: "в продаже",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.toLowerCase();
}

function twinKey(lot: Pick<StockLot, "projectName" | "houseName" | "number">): string {
  return `${normalizeProject(lot.projectName)}|${normalizeHouse(lot.houseName)}|${lot.number.trim()}`;
}

/// `object` — как объект зовут в компании: «Заря», «Пьермонт». В названиях
/// проектов Profitbase он записан по-своему, и тащить это в окно незачем.
export function checkStock(object: string, lots: StockLot[], live: LiveAd[]): StockCheck {
  const byId = new Map(lots.map((lot) => [String(lot.id), lot]));

  // Двойники ищутся среди основных проектов — тех, что не помечены как копии.
  const mains = new Map<string, StockLot>();
  for (const lot of lots) {
    if (/для\s+авито/i.test(lot.projectName)) continue;
    mains.set(twinKey(lot), lot);
  }

  const stale: StaleAd[] = [];
  let unmatched = 0;

  for (const ad of live) {
    const copy = byId.get(ad.adId);
    // Лота нет в остатках вовсе: объявление живёт от того, чего в Profitbase
    // уже не существует. Это тоже «не сопоставлено», а не «всё в порядке».
    if (!copy) {
      unmatched++;
      continue;
    }

    const twin = mains.get(twinKey(copy));
    if (!twin) {
      unmatched++;
      continue;
    }

    if (twin.status === ON_SALE) continue;

    stale.push({
      adId: ad.adId,
      object,
      house: normalizeHouse(copy.houseName),
      number: copy.number,
      floor: copy.floor,
      rooms: copy.rooms,
      areaTotal: copy.areaTotal,
      status: twin.status,
      price: ad.price ?? copy.price,
      avitoId: ad.avitoId,
      url: ad.url,
    });
  }

  stale.sort((a, b) => a.house.localeCompare(b.house, "ru") || a.number.localeCompare(b.number, "ru", { numeric: true }));

  return { stale, unmatched };
}
