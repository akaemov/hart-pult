import "server-only";
import { CHANNELS, type Channel, type ObjectName } from "../channels";
import { leadsByChannel, parseMonthKey } from "./leads-by-channel";

/// Таблица «лиды по источникам» в том же виде, в каком её ждёт документ
/// заказчика: блок на объект, строки-каналы, колонки-месяцы.

const RU_MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

export type TableRow = { channel: Channel | "ВСЕГО лидов" | "из них целевых"; values: number[]; total: number };
export type ObjectTable = { object: ObjectName; rows: TableRow[] };

export type ChannelTable = {
  months: string[];
  monthLabels: string[];
  objects: ObjectTable[];
  totalLeads: number;
  /// Сколько лидов не удалось отнести к объекту и к источнику — то, что
  /// в документе заказчика показать негде, а знать необходимо.
  unassignedObject: number;
  unknownChannel: number;
};

export async function buildChannelTable(from: Date): Promise<ChannelTable> {
  const { reports, months, totalLeads } = await leadsByChannel(from);

  const objects: ObjectTable[] = (["Заря", "Пьермонт", "Не определён"] as ObjectName[]).map((object) => {
    const report = reports.get(object);
    const rows: TableRow[] = CHANNELS.map((channel) => {
      const values = months.map((m) => report?.months.get(m)?.byChannel.get(channel) ?? 0);
      return { channel, values, total: values.reduce((a, b) => a + b, 0) };
    });

    const totals = months.map((m) => report?.months.get(m)?.total ?? 0);
    const qualified = months.map((m) => report?.months.get(m)?.qualified ?? 0);
    rows.push({ channel: "ВСЕГО лидов", values: totals, total: totals.reduce((a, b) => a + b, 0) });
    rows.push({ channel: "из них целевых", values: qualified, total: qualified.reduce((a, b) => a + b, 0) });

    return { object, rows };
  });

  const unassignedObject = objects.find((o) => o.object === "Не определён")
    ?.rows.find((r) => r.channel === "ВСЕГО лидов")?.total ?? 0;
  const unknownChannel = objects.reduce(
    (sum, o) => sum + (o.rows.find((r) => r.channel === "Источник не указан")?.total ?? 0),
    0,
  );

  return {
    months,
    monthLabels: months.map((key) => {
      const { year, month } = parseMonthKey(key);
      return `${RU_MONTHS[month - 1]} ${year}`;
    }),
    objects,
    totalLeads,
    unassignedObject,
    unknownChannel,
  };
}
