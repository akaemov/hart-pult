import { describe, expect, it } from "vitest";
import { checkStock, statusLabel, type LiveAd, type StockLot } from "./stock-check";

function lot(over: Partial<StockLot> & { id: number }): StockLot {
  return {
    projectName: "ЖК Заря",
    houseName: "Секция А",
    number: "77",
    floor: 5,
    rooms: 2,
    areaTotal: 52.6,
    status: "AVAILABLE",
    price: 9_000_000,
    ...over,
  };
}

function ad(over: Partial<LiveAd> & { adId: string }): LiveAd {
  return { avitoId: "8000000001", url: "https://www.avito.ru/items/8000000001", price: 9_000_000, ...over };
}

describe("checkStock", () => {
  it("ловит объявление на квартиру, проданную в основном проекте", () => {
    const check = checkStock(
      "Заря",
      [
        lot({ id: 17815369, projectName: "ЗАРЯ ДЛЯ АВИТО", status: "AVAILABLE" }),
        lot({ id: 15000001, projectName: "ЖК Заря", status: "SOLD" }),
      ],
      [ad({ adId: "17815369" })],
    );

    expect(check.stale).toHaveLength(1);
    expect(check.stale[0]).toMatchObject({ number: "77", house: "секция а", status: "SOLD" });
    expect(check.unmatched).toBe(0);
  });

  it("считает расхождением и бронь, и снятие с продажи", () => {
    for (const status of ["BOOKED", "UNAVAILABLE"]) {
      const check = checkStock(
        "Заря",
        [
          lot({ id: 1, projectName: "ЗАРЯ ДЛЯ АВИТО" }),
          lot({ id: 2, projectName: "ЖК Заря", status }),
        ],
        [ad({ adId: "1" })],
      );
      expect(check.stale.map((s) => s.status)).toEqual([status]);
    }
  });

  it("молчит, когда квартира и правда в продаже", () => {
    const check = checkStock(
      "Заря",
      [lot({ id: 1, projectName: "ЗАРЯ ДЛЯ АВИТО" }), lot({ id: 2, projectName: "ЖК Заря" })],
      [ad({ adId: "1" })],
    );
    expect(check.stale).toEqual([]);
  });

  it("сходится через пометку про фиды в названии секции", () => {
    const check = checkStock(
      "Пьермонт",
      [
        lot({ id: 1, projectName: "ПЬЕРМОНТ ДЛЯ АВИТО", houseName: "Секция Б (для фидов Авито)", number: "58" }),
        lot({ id: 2, projectName: "ПьермÓнт", houseName: "Секция Б", number: "58", status: "SOLD" }),
      ],
      [ad({ adId: "1" })],
    );
    expect(check.stale).toHaveLength(1);
  });

  it("не прячет лот, которому не нашлось двойника", () => {
    const check = checkStock(
      "Пьермонт",
      [lot({ id: 1, projectName: "ПЬЕРМОНТ ДЛЯ АВИТО", number: "999" })],
      [ad({ adId: "1" })],
    );
    expect(check.stale).toEqual([]);
    expect(check.unmatched).toBe(1);
  });

  it("считает несопоставленным и объявление без лота в остатках", () => {
    expect(checkStock("Заря", [], [ad({ adId: "404" })]).unmatched).toBe(1);
  });
});

describe("statusLabel", () => {
  it("говорит словами, а не кодом", () => {
    expect(statusLabel("SOLD")).toBe("продана");
    expect(statusLabel("BOOKED")).toBe("забронирована");
  });
});
