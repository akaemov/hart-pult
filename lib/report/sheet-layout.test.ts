import { describe, expect, it } from "vitest";
import { agentsRow, channelRow, columnName, monthColumn, qualifiedRow, SHEET_CHANNELS } from "./sheet-layout";

describe("columnName", () => {
  it("считает буквы колонок", () => {
    expect(columnName(1)).toBe("A");
    expect(columnName(26)).toBe("Z");
    expect(columnName(27)).toBe("AA");
    expect(columnName(30)).toBe("AD");
  });
});

describe("monthColumn", () => {
  it("совпадает с реальной таблицей заказчика", () => {
    expect(monthColumn(2024, 1)).toBe("E");
    expect(monthColumn(2025, 1)).toBe("Q");
    expect(monthColumn(2025, 6)).toBe("V");
    // между июнем и июлем 2025 стоит колонка «Итого до 07.2025»
    expect(monthColumn(2025, 7)).toBe("X");
    expect(monthColumn(2025, 12)).toBe("AC");
    expect(monthColumn(2026, 1)).toBe("AD");
    expect(monthColumn(2026, 8)).toBe("AK");
    expect(monthColumn(2026, 12)).toBe("AO");
  });

  it("месяц вне таблицы не получает колонку", () => {
    expect(monthColumn(2023, 12)).toBeNull();
    expect(monthColumn(2029, 1)).toBeNull();
  });
});

describe("строки блоков", () => {
  it("«Заря» начинается с шестой строки, «Пьермонт» — с девятнадцатой", () => {
    expect(channelRow("Заря", "Диджитал (Директ / VK / соцсети)")).toBe(6);
    expect(channelRow("Заря", "Прочие источники")).toBe(13);
    expect(channelRow("Пьермонт", "Диджитал (Директ / VK / соцсети)")).toBe(19);
    expect(channelRow("Пьермонт", "Прочие источники")).toBe(26);
  });

  it("строки «ВСЕГО» пропущены: там формулы заказчика", () => {
    expect(SHEET_CHANNELS).toHaveLength(8);
    expect(channelRow("Заря", "Фиксации от агентств")).toBeNull();
    expect(channelRow("Заря", "Источник не указан")).toBeNull();
    expect(agentsRow("Заря")).toBe(16);
    expect(qualifiedRow("Пьермонт")).toBe(28);
  });
});
