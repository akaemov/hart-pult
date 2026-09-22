import { getCurrentUser } from "@/lib/auth/dal";
import { accountById, ACCOUNTS } from "@/lib/avito";
import { avitoReport } from "@/lib/report/avito";
import { statusLabel } from "@/lib/stock-check";

/// CSV с расхождениями по одному объекту: три блока — не доехало, висит лишним,
/// разошлась цена. Открывается в Excel и уходит в Profitbase как список того,
/// что надо починить.

/// Дробные — с запятой: Excel в русской локали иначе считает «84.14» текстом,
/// и отсортировать по площади уже нельзя.
function cell(value: string | number | null): string {
  const text =
    value === null ? "" : typeof value === "number" ? value.toLocaleString("ru-RU", { useGrouping: false, maximumFractionDigits: 2 }) : value;
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Нужен вход", { status: 401 });

  const id = new URL(request.url).searchParams.get("account") ?? "";
  const account = accountById(id);
  if (!account) {
    return new Response(`Неизвестный объект. Есть: ${ACCOUNTS.map((a) => a.id).join(", ")}.`, {
      status: 400,
    });
  }

  const report = await avitoReport();
  const check = report.accounts[ACCOUNTS.indexOf(account)];
  const lines: (string | number | null)[][] = [];

  lines.push([`Сверка Авито — «${check.object}»`]);
  lines.push([`Данные на ${new Date().toLocaleString("ru-RU")}`]);
  lines.push(["В фиде", check.feed, "На Авито", check.published]);
  lines.push([]);

  lines.push([`Продано, а объявление висит (${check.stock.stale.length})`]);
  lines.push(["Секция", "Квартира", "Комнат", "Площадь, м²", "Этаж", "В проекте", "Цена в объявлении, ₽", "Ссылка"]);
  for (const lot of check.stock.stale) {
    lines.push([
      lot.house,
      lot.number,
      lot.rooms,
      lot.areaTotal,
      lot.floor,
      statusLabel(lot.status),
      lot.price,
      lot.url ?? "",
    ]);
  }
  if (check.stock.unmatched > 0) {
    lines.push([`Не удалось сопоставить с лотом основного проекта: ${check.stock.unmatched}`]);
  }
  lines.push([]);

  lines.push([`Не доехали до Авито (${check.rejected.length})`]);
  lines.push(["Лот", "Комнат", "Общая, м²", "Жилая, м²", "Этаж", "Цена, ₽", "Что говорит Авито", "Что чинить"]);
  for (const lot of check.rejected) {
    lines.push([
      lot.adId,
      lot.rooms,
      lot.square,
      lot.livingSpace,
      lot.floor,
      lot.price,
      lot.reasons.join("; "),
      lot.cause ?? "",
    ]);
  }
  lines.push([]);

  lines.push([`Висят на Авито, а в фиде их нет (${check.orphans.length})`]);
  lines.push(["Объявление", "Название", "Адрес", "Цена, ₽", "Состояние", "Ссылка"]);
  for (const item of check.orphans) {
    lines.push([item.avitoId, item.title, item.address, item.price, item.status, item.url]);
  }
  lines.push([]);

  lines.push([`Цена в объявлении не та, что в фиде (${check.priceGaps.length})`]);
  lines.push(["Лот", "Объявление", "В фиде, ₽", "На Авито, ₽", "Разница, ₽", "Ссылка"]);
  for (const gap of check.priceGaps) {
    lines.push([gap.adId, gap.avitoId, gap.feedPrice, gap.avitoPrice, gap.diff, gap.url]);
  }

  // Точка с запятой и BOM: иначе Excel в русской локали склеит всё в столбец.
  const csv = "﻿" + lines.map((row) => row.map(cell).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="avito-${account.id}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
