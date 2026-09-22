import { describe, expect, it } from "vitest";
import {
  checkAccount,
  explainRejection,
  summarizeRejections,
  type CheckAd,
  type CheckItem,
} from "./avito-check";

function ad(over: Partial<CheckAd> = {}): CheckAd {
  return {
    adId: "1",
    rooms: 2,
    square: 60,
    livingSpace: 30,
    floor: 5,
    price: 1_000_000,
    inFeed: true,
    messages: [],
    avitoId: "8000000001",
    ...over,
  };
}

function item(over: Partial<CheckItem> = {}): CheckItem {
  return {
    avitoId: "8000000001",
    title: "2-к. квартира, 60 м²",
    address: "ул. Сипайловская",
    price: 1_000_000,
    status: "active",
    url: "https://www.avito.ru/items/8000000001",
    ...over,
  };
}

describe("explainRejection", () => {
  it("узнаёт жилую площадь больше общей — то, о чём Авито не говорит", () => {
    expect(explainRejection({ square: 84.14, livingSpace: 84.58 })).toContain("больше общей");
  });

  it("не выдумывает причину, когда площади в порядке", () => {
    expect(explainRejection({ square: 84.58, livingSpace: 40 })).toBeNull();
  });

  it("называет пустую общую площадь", () => {
    expect(explainRejection({ square: null, livingSpace: 40 })).toContain("нет общей площади");
  });
});

describe("checkAccount", () => {
  it("считает не доехавшим лот без объявления и объясняет причину", () => {
    const check = checkAccount(
      "Пьермонт",
      [
        ad(),
        ad({
          adId: "2",
          avitoId: null,
          square: 84.14,
          livingSpace: 84.58,
          messages: [
            { code: 1058, type: "error", title: "Проверьте значение параметра Square", detail: "Неправильное значение поля" },
            { code: 1229, type: "warning", title: "Адрес взят из NewDevelopmentId", detail: "" },
          ],
        }),
      ],
      [item()],
    );

    expect(check.feed).toBe(2);
    expect(check.published).toBe(1);
    expect(check.rejected).toHaveLength(1);
    expect(check.rejected[0].adId).toBe("2");
    expect(check.rejected[0].reasons).toEqual([
      "Проверьте значение параметра Square — Неправильное значение поля",
    ]);
    expect(check.rejected[0].cause).toContain("больше общей");
  });

  it("находит объявление, за которым не стоит лот фида", () => {
    const check = checkAccount("Заря", [ad()], [item(), item({ avitoId: "8000000002", title: "Студия" })]);
    expect(check.orphans.map((o) => o.avitoId)).toEqual(["8000000002"]);
  });

  it("лот, ушедший из фида, не делает своё объявление лишним дважды", () => {
    const check = checkAccount(
      "Заря",
      [ad({ inFeed: false })],
      [item()],
    );
    expect(check.feed).toBe(0);
    expect(check.orphans).toHaveLength(1);
  });

  it("ловит расхождение цены и считает знак разницы", () => {
    const check = checkAccount("Заря", [ad({ price: 1_000_000 })], [item({ price: 1_100_000 })]);
    expect(check.priceGaps).toHaveLength(1);
    expect(check.priceGaps[0].diff).toBe(100_000);
  });

  it("одинаковую цену расхождением не считает", () => {
    expect(checkAccount("Заря", [ad()], [item()]).priceGaps).toEqual([]);
  });
});

describe("summarizeRejections", () => {
  it("говорит обо всём списке, а не о первой строке", () => {
    const rejected = [
      { adId: "1", rooms: 3, square: 84.14, livingSpace: 84.58, floor: 6, price: null, reasons: [], cause: null },
      { adId: "2", rooms: 2, square: 59.92, livingSpace: 62.44, floor: 7, price: null, reasons: [], cause: null },
    ];
    expect(summarizeRejections(rejected)).toContain("У всех 2");
  });

  it("считает только те лоты, где дело в площади", () => {
    const rejected = [
      { adId: "1", rooms: 3, square: 84.14, livingSpace: 84.58, floor: 6, price: null, reasons: [], cause: null },
      { adId: "2", rooms: 2, square: 60, livingSpace: 30, floor: 7, price: null, reasons: ["Нет фотографий"], cause: null },
    ];
    expect(summarizeRejections(rejected)).toContain("У 1 из 2");
  });

  it("молчит, когда причина другая", () => {
    expect(
      summarizeRejections([
        { adId: "1", rooms: 2, square: 60, livingSpace: 30, floor: 7, price: null, reasons: ["Нет фотографий"], cause: null },
      ]),
    ).toBeNull();
  });
});
