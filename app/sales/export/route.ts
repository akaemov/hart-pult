import { getCurrentUser } from "@/lib/auth/dal";
import { salesReport } from "@/lib/report/sales";

/// CSV по одному объекту: остатки по секциям и по комнатности, цена метра,
/// отстающие группы. Открывается в Excel и годится для разговора с отделом
/// продаж без пульта под рукой.

function cell(value: string | number | null): string {
  const text =
    value === null
      ? ""
      : typeof value === "number"
        ? value.toLocaleString("ru-RU", { useGrouping: false, maximumFractionDigits: 2 })
        : value;
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Нужен вход", { status: 401 });

  const wanted = new URL(request.url).searchParams.get("object") ?? "";
  const report = await salesReport();
  const sales = report.objects.find((item) => item.object === wanted);
  if (!sales) {
    return new Response(
      `Неизвестный объект. Есть: ${report.objects.map((item) => item.object).join(", ")}.`,
      { status: 400 },
    );
  }

  const lines: (string | number | null)[][] = [];
  const percent = (value: number | null) => (value === null ? "" : Math.round(value * 100));

  lines.push([`Остатки — «${sales.object}»`]);
  lines.push([`Данные на ${new Date().toLocaleString("ru-RU")}`]);
  lines.push(["Свободно", sales.available, "Бронь", sales.booked, "Продано", sales.sold]);
  lines.push(["Остаток, м²", sales.availableArea, "Остаток, ₽", sales.availableValue]);
  lines.push(["Цена метра по свободным, ₽", sales.pricePerMeter]);
  lines.push([]);

  for (const [header, rows, meters] of [
    ["Секция", sales.bySection, null],
    ["Комнатность", sales.byRooms, sales.meterByRooms],
  ] as const) {
    lines.push([`Остатки по разрезу «${header}»`]);
    lines.push([header, "Свободно", "Бронь", "Продано", "Продано, %", "Остаток, м²", "Остаток, ₽", "Цена м², ₽"]);
    for (const row of rows) {
      lines.push([
        row.key,
        row.available,
        row.booked,
        row.sold,
        percent(row.soldShare),
        row.availableArea,
        row.availableValue,
        meters?.find((item) => item.key === row.key)?.value ?? "",
      ]);
    }
    lines.push([]);
  }

  lines.push([`Что не разбирают (${sales.slow.length})`]);
  lines.push(["Группа", "Продано, %", "Отставание, п.п.", "В остатке, шт", "В остатке, ₽"]);
  for (const row of sales.slow) {
    lines.push([row.key, percent(row.soldShare), Math.round(row.behind * 100), row.available, row.availableValue]);
  }

  // Точка с запятой и BOM: иначе Excel в русской локали склеит всё в столбец.
  const csv = "﻿" + lines.map((row) => row.map(cell).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
