import { getCurrentUser } from "@/lib/auth/dal";
import { buildChannelTable } from "@/lib/report/channel-table";

/// CSV в раскладке документа заказчика: блок на объект, строки в том же
/// порядке, колонки-месяцы. Импортируется в Google-таблицу без скриптов:
/// Файл → Импорт → «Заменить лист».

function cell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Нужен вход", { status: 401 });

  const table = await buildChannelTable(new Date("2024-01-01T00:00:00Z"));
  const lines: (string | number)[][] = [];

  lines.push(["Лиды по источникам — выгрузка из amoCRM"]);
  lines.push([`Данные на ${new Date().toLocaleString("ru-RU")}`]);
  lines.push([]);

  for (const block of table.objects) {
    lines.push([block.object === "Не определён" ? "Объект не определён" : `«${block.object}»`]);
    lines.push(["Источник", "Ед.", ...table.monthLabels, "Итого"]);
    for (const row of block.rows) {
      lines.push([row.channel, "шт", ...row.values, row.total]);
    }
    lines.push([]);
  }

  lines.push(["Сверка"]);
  lines.push(["Всего сделок", table.totalLeads]);
  lines.push(["Не отнесено к объекту", table.unassignedObject]);
  lines.push(["Без источника", table.unknownChannel]);
  lines.push(["Avito, ЦИАН, Домклик", "в amoCRM таких источников нет ни у одной сделки"]);

  // Точка с запятой и BOM: иначе Excel в русской локали склеит всё в столбец.
  const csv = "﻿" + lines.map((row) => row.map(cell).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-by-source-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
