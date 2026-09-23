import { describe, expect, it } from "vitest";
import {
  groupStock,
  pricePerMeter,
  roomsLabel,
  roomsOrder,
  salesByMonth,
  slowMovers,
  type SalesLot,
} from "./sales";

function lot(over: Partial<SalesLot> = {}): SalesLot {
  return {
    houseName: "Секция А",
    number: "1",
    rooms: 1,
    studio: false,
    areaTotal: 40,
    status: "AVAILABLE",
    price: 8_000_000,
    ...over,
  };
}

describe("roomsLabel", () => {
  it("отличает студию от однушки", () => {
    expect(roomsLabel({ rooms: 1, studio: true })).toBe("Студия");
    expect(roomsLabel({ rooms: 1, studio: false })).toBe("1-комн.");
  });

  it("не прячет лот без комнатности", () => {
    expect(roomsLabel({ rooms: null, studio: false })).toBe("Без комнатности");
  });

  it("ставит студии первыми", () => {
    expect(roomsOrder("Студия")).toBeLessThan(roomsOrder("1-комн."));
    expect(roomsOrder("1-комн.")).toBeLessThan(roomsOrder("3-комн."));
  });
});

describe("groupStock", () => {
  const lots = [
    lot({ houseName: "Секция А", status: "AVAILABLE", areaTotal: 40, price: 8_000_000 }),
    lot({ houseName: "Секция А", status: "SOLD" }),
    lot({ houseName: "Секция А", status: "BOOKED" }),
    lot({ houseName: "Секция А", status: "UNAVAILABLE" }),
    lot({ houseName: "Секция Б", status: "SOLD" }),
  ];

  it("считает остаток и деньги только по свободным", () => {
    const [a] = groupStock(lots, (l) => l.houseName);
    expect(a).toMatchObject({ key: "Секция А", available: 1, booked: 1, sold: 1, unavailable: 1 });
    expect(a.availableArea).toBe(40);
    expect(a.availableValue).toBe(8_000_000);
  });

  it("не считает снятые с продажи в доле проданного", () => {
    const [a] = groupStock(lots, (l) => l.houseName);
    // Продана 1 из 3 выставлявшихся: снятая с продажи в знаменатель не идёт.
    expect(a.soldShare).toBeCloseTo(1 / 3);
  });

  it("возвращает null, когда продавать было нечего", () => {
    const [row] = groupStock([lot({ status: "UNAVAILABLE" })], (l) => l.houseName);
    expect(row.soldShare).toBeNull();
  });
});

describe("pricePerMeter", () => {
  it("взвешивает по метрам, а не усредняет цены квартир", () => {
    const value = pricePerMeter([
      lot({ areaTotal: 100, price: 20_000_000 }),
      lot({ areaTotal: 20, price: 2_000_000 }),
    ]);
    // (20 000 000 + 2 000 000) / 120 = 183 333, а не среднее из 200 000 и 100 000.
    expect(value).toBe(183_333);
  });

  it("считает только по свободным", () => {
    expect(pricePerMeter([lot({ status: "SOLD", areaTotal: 50, price: 25_000_000 })])).toBeNull();
  });

  it("не делит на ноль на пустом остатке", () => {
    expect(pricePerMeter([])).toBeNull();
  });
});

describe("slowMovers", () => {
  const rows = groupStock(
    [
      ...Array.from({ length: 8 }, () => lot({ rooms: 3, status: "AVAILABLE" })),
      ...Array.from({ length: 2 }, () => lot({ rooms: 3, status: "SOLD" })),
      ...Array.from({ length: 8 }, () => lot({ rooms: 1, status: "SOLD" })),
      ...Array.from({ length: 6 }, () => lot({ rooms: 1, status: "AVAILABLE" })),
    ],
    (l) => `${l.rooms}`,
  );

  it("называет группу, которая отстаёт от объекта", () => {
    const slow = slowMovers(rows, 10 / 24);
    expect(slow.map((row) => row.key)).toEqual(["3"]);
    expect(slow[0].available).toBe(8);
  });

  it("молчит, когда остаток слишком мал для разговора", () => {
    const small = groupStock(
      [lot({ rooms: 4, status: "AVAILABLE" }), lot({ rooms: 4, status: "SOLD" })],
      (l) => `${l.rooms}`,
    );
    expect(slowMovers(small, 0.9)).toEqual([]);
  });

  it("не жалуется на группу, которая идёт вровень", () => {
    expect(slowMovers(rows, 0.3)).toEqual([]);
  });
});

describe("salesByMonth", () => {
  const key = (date: Date) => date.toISOString().slice(0, 7);

  it("считает штуки и рубли по месяцу закрытия", () => {
    const rows = salesByMonth(
      [
        { closedAt: new Date("2026-09-03T10:00:00Z"), price: 9_000_000, object: "Заря" },
        { closedAt: new Date("2026-09-20T10:00:00Z"), price: 11_000_000, object: "Заря" },
        { closedAt: new Date("2026-08-31T10:00:00Z"), price: 5_000_000, object: "Заря" },
      ],
      key,
    );
    expect(rows).toEqual([
      { month: "2026-09", deals: 2, value: 20_000_000 },
      { month: "2026-08", deals: 1, value: 5_000_000 },
    ]);
  });

  it("сделку без суммы считает штукой, но не рублями", () => {
    const [row] = salesByMonth([{ closedAt: new Date("2026-09-03T10:00:00Z"), price: null, object: "Заря" }], key);
    expect(row).toEqual({ month: "2026-09", deals: 1, value: 0 });
  });
});
