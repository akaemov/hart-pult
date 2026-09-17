import { getCurrentUser } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { describeFilter, parseLeadFilter, queryLeads } from "@/lib/leads-query";

/// Выгрузка списка сделок в CSV. Правило 1 из ТЗ требует не только показать
/// список на экране, но и дать унести его в таблицу.

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  // Route Handler — такой же публичный вход, как страница: проверяем сессию
  // здесь же, а не полагаемся на proxy.
  const user = await getCurrentUser();
  if (!user) return new Response("Нужен вход", { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filter = parseLeadFilter(params);
  const leads = await queryLeads(filter);
  const canSeeNames = user.role !== "VIEWER";

  const header = [
    "Сделка",
    "id",
    "Менеджер",
    "Создана",
    "Первый звонок",
    "Ответ, рабочих мин",
    "Ответ, календарных мин",
    "Ждёт, рабочих мин",
    "Ждёт, календарных мин",
  ];
  const rows = leads.map((lead) => [
    canSeeNames ? lead.name : `Сделка ${lead.id}`,
    lead.id,
    lead.responsibleName ?? "",
    formatDateTime(lead.createdAt),
    lead.firstOutgoingCallAt ? formatDateTime(lead.firstOutgoingCallAt) : "",
    lead.delay ?? "",
    lead.delayCalendar ?? "",
    lead.waiting ?? "",
    lead.waitingCalendar ?? "",
  ]);

  // Точка с запятой и BOM: иначе Excel в русской локали склеит всё в один столбец.
  const csv = "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${Date.now()}.csv"`,
        "X-Filter": encodeURIComponent(describeFilter(filter)),
    },
  });
}
