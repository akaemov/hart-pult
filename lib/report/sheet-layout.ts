/// Раскладка вкладки «2. Лиды по источникам» в таблице заказчика.
///
/// Координаты описаны здесь, а не собираются на лету: попасть не в ту строку
/// хуже, чем не записать вовсе. Приёмник в таблице дополнительно сверяет
/// размер диапазона с размером данных и пропускает запись при расхождении.

import type { Channel, ObjectName } from "../channels";

export const SHEET_NAME = "2. Лиды по источникам";

/// Месяцы идут подряд с января 2024 (колонка E) по декабрь 2028, но между
/// июнем и июлем 2025 вклинена колонка W «Итого до 07.2025» — её пропускаем.
const FIRST_MONTH = { year: 2024, month: 1 };
const FIRST_COLUMN = 5; // E
const TOTAL_COLUMN = 23; // W

export function columnName(index: number): string {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/// Колонка месяца: 2026-01 → «AD». Null, если месяц вне таблицы.
export function monthColumn(year: number, month: number): string | null {
  const offset = (year - FIRST_MONTH.year) * 12 + (month - FIRST_MONTH.month);
  if (offset < 0) return null;
  let index = FIRST_COLUMN + offset;
  if (index >= TOTAL_COLUMN) index += 1; // перепрыгиваем колонку «Итого»
  return index <= 65 ? columnName(index) : null; // до BM включительно
}

/// Объекты, под которые в документе заказчика заведены блоки строк.
/// «Ураксина» сюда не входит: в таблице её блока нет, и придумывать номера
/// строк за заказчика нельзя — выгрузка встанет не в те ячейки.
export type SheetObject = Extract<ObjectName, "Заря" | "Пьермонт">;

export function isSheetObject(object: ObjectName): object is SheetObject {
  return object === "Заря" || object === "Пьермонт";
}

/// Строки блоков по объектам. «ВСЕГО лидов» не перечислено намеренно:
/// там формула заказчика, и она же служит проверкой нашей суммы.
const BLOCKS: Record<SheetObject, { first: number; qualified: number; agents: number }> = {
  "Заря": { first: 6, qualified: 15, agents: 16 },
  "Пьермонт": { first: 19, qualified: 28, agents: 29 },
};

/// Порядок строк-источников внутри блока, ровно как в таблице.
export const SHEET_CHANNELS: Channel[] = [
  "Диджитал (Директ / VK / соцсети)",
  "Avito",
  "ЦИАН",
  "Домклик",
  "Сайт / прямые обращения",
  "Наружка / офлайн",
  "Сарафан / реферал",
  "Прочие источники",
];

export function channelRow(object: SheetObject, channel: Channel): number | null {
  const index = SHEET_CHANNELS.indexOf(channel);
  return index === -1 ? null : BLOCKS[object].first + index;
}

export function qualifiedRow(object: SheetObject): number {
  return BLOCKS[object].qualified;
}

export function agentsRow(object: SheetObject): number {
  return BLOCKS[object].agents;
}
