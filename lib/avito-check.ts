/// Сверка Авито: три расхождения между фидом Profitbase и тем, что висит
/// в кабинете. Считается здесь, без базы и без сети, — поэтому проверяется
/// тестами, а не глазами на боевых данных.
///
/// Чего эта сверка не ловит: проданную квартиру, которая осталась в продаже.
/// Profitbase отдаёт проданные лоты в фид наравне с остальными, а признака
/// «продано» в фиде нет вообще. Пока нет доступа к API Profitbase, о продаже
/// пульту узнать неоткуда — и честнее этого не показывать, чем показывать
/// пустую вкладку с обещанием.

export type Message = { code: number | null; type: string; title: string; detail: string };

export type CheckAd = {
  adId: string;
  rooms: number | null;
  square: number | null;
  livingSpace: number | null;
  floor: number | null;
  price: number | null;
  inFeed: boolean;
  messages: Message[];
  /// Номер объявления на Авито. Null — у лота объявления нет.
  avitoId: string | null;
};

export type CheckItem = {
  avitoId: string;
  title: string;
  address: string;
  price: number | null;
  status: string;
  url: string;
};

/// Лот из фида, которого нет на Авито.
export type Rejected = {
  adId: string;
  rooms: number | null;
  square: number | null;
  livingSpace: number | null;
  floor: number | null;
  price: number | null;
  reasons: string[];
  /// Разбор причины в словах, а не кодом Авито. Null — причину не опознали,
  /// тогда на экране остаются исходные сообщения.
  cause: string | null;
};

/// Объявление на Авито, которого нет в фиде.
export type Orphan = CheckItem;

export type PriceGap = {
  adId: string;
  avitoId: string;
  title: string;
  url: string;
  feedPrice: number;
  avitoPrice: number;
  diff: number;
};

export type AccountCheck = {
  object: string;
  feed: number;
  published: number;
  rejected: Rejected[];
  orphans: Orphan[];
  priceGaps: PriceGap[];
};

/// Причина, по которой Авито отбивает лот, в терминах данных Profitbase.
///
/// Авито пишет «проверьте Square / Общая площадь» и в том случае, когда с самой
/// общей площадью всё в порядке, а больше неё оказалась жилая. Из текста Авито
/// этого не понять; из двух чисел фида — понять можно, и чинить надо именно их.
export function explainRejection(ad: Pick<CheckAd, "square" | "livingSpace">): string | null {
  const { square, livingSpace } = ad;

  if (square !== null && livingSpace !== null && livingSpace > square) {
    return (
      `Жилая площадь ${livingSpace} м² больше общей ${square} м². ` +
      "Авито такой лот не принимает. Чинится в карточке лота в Profitbase."
    );
  }

  if (square === null) return "В фиде нет общей площади.";

  return null;
}

/// Общая причина на весь список, а не на первую строку. Шестнадцать лотов
/// с одной и той же бедой — это один разговор с Profitbase, а не шестнадцать.
export function summarizeRejections(rejected: Rejected[]): string | null {
  if (rejected.length === 0) return null;

  const oversized = rejected.filter(
    (lot) => lot.square !== null && lot.livingSpace !== null && lot.livingSpace > lot.square,
  );
  if (oversized.length === 0) return null;

  const scope =
    oversized.length === rejected.length
      ? `У всех ${rejected.length}`
      : `У ${oversized.length} из ${rejected.length}`;

  return (
    `${scope} лотов жилая площадь больше общей — Авито такие объявления не принимает. ` +
    "Авито при этом показывает на общую площадь, и по его подсказке менять нечего: " +
    "чинить надо жилую, в карточке лота в Profitbase."
  );
}

function errorReasons(messages: Message[]): string[] {
  const seen = new Set<string>();
  return messages
    .filter((message) => message.type === "error")
    .map((message) => [message.title, message.detail].filter(Boolean).join(" — "))
    .filter((text) => {
      if (text === "" || seen.has(text)) return false;
      seen.add(text);
      return true;
    });
}

export function checkAccount(object: string, ads: CheckAd[], items: CheckItem[]): AccountCheck {
  const inFeed = ads.filter((ad) => ad.inFeed);

  const rejected = inFeed
    .filter((ad) => ad.avitoId === null)
    // По возрастанию номера лота: в Profitbase их чинят списком, и порядок
    // должен совпадать с тем, в каком они там лежат.
    .sort((a, b) => a.adId.localeCompare(b.adId, "ru", { numeric: true }))
    .map((ad) => ({
      adId: ad.adId,
      rooms: ad.rooms,
      square: ad.square,
      livingSpace: ad.livingSpace,
      floor: ad.floor,
      price: ad.price,
      reasons: errorReasons(ad.messages),
      cause: explainRejection(ad),
    }));

  // Объявление, за которым не стоит ни один лот фида. Автозагрузка настроена
  // так, что такие объявления не снимаются, — значит, висят до тех пор, пока
  // их не снимут руками.
  const known = new Set(inFeed.map((ad) => ad.avitoId).filter((id): id is string => id !== null));
  const orphans = items.filter((item) => !known.has(item.avitoId));

  const priceByAvitoId = new Map(items.map((item) => [item.avitoId, item]));
  const priceGaps: PriceGap[] = [];
  for (const ad of inFeed) {
    if (ad.avitoId === null || ad.price === null) continue;
    const item = priceByAvitoId.get(ad.avitoId);
    if (!item || item.price === null || item.price === ad.price) continue;
    priceGaps.push({
      adId: ad.adId,
      avitoId: ad.avitoId,
      title: item.title,
      url: item.url,
      feedPrice: ad.price,
      avitoPrice: item.price,
      diff: item.price - ad.price,
    });
  }

  return {
    object,
    feed: inFeed.length,
    published: items.length,
    rejected,
    orphans,
    priceGaps,
  };
}
