/// Разбор фида Profitbase для Авито (формат Ads/Ad, версия 3).
///
/// Своего разбора XML, а не библиотеки: из двух десятков тегов пульту нужны
/// шесть, а описание лота — половина мегабайта текста, который незачем даже
/// разворачивать в память.
///
/// Формат плоский: один уровень тегов внутри <Ad>, вложенность только у картинок
/// и опций, которые мы не читаем.

export type FeedAd = {
  adId: string;
  rooms: number | null;
  square: number | null;
  livingSpace: number | null;
  floor: number | null;
  price: number | null;
};

function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  if (!match) return null;
  const value = match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
  return value === "" ? null : value;
}

/// Числа в фиде приходят с точкой, но встречается и запятая — Profitbase
/// собирает их из разных источников.
function number(block: string, name: string): number | null {
  const raw = tag(block, name);
  if (raw === null) return null;
  const value = Number(raw.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseFeed(xml: string): FeedAd[] {
  const ads: FeedAd[] = [];

  for (const match of xml.matchAll(/<Ad>([\s\S]*?)<\/Ad>/g)) {
    const block = match[1];
    const adId = tag(block, "Id");
    // Лот без Id в фиде бесполезен: его не с чем сопоставить ни в отчёте
    // автозагрузки, ни в Profitbase.
    if (!adId) continue;

    ads.push({
      adId,
      rooms: number(block, "Rooms"),
      square: number(block, "Square"),
      livingSpace: number(block, "LivingSpace"),
      floor: number(block, "Floor"),
      price: number(block, "Price"),
    });
  }

  return ads;
}
