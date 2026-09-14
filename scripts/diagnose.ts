/// Диагностика данных amoCRM — первый шаг проекта.
///
/// Отвечает на три вопроса до того, как написана хоть одна строчка дашборда:
///   1. Доходит ли до CRM источник обращения — иначе не посчитать CPL по каналам.
///   2. Звонят ли менеджеры через телефонию — иначе не построить блок обработки.
///   3. Как быстро отвечают на обращения и сколько их вообще не обработано.
///
/// Скрипт ничего не пишет в amoCRM и ничего не сохраняет в базу: только читает
/// и складывает отчёт в reports/. Запуск: npm run diagnose -- --days 90
import { mkdirSync, writeFileSync } from "node:fs";
import { amoList, type AmoCustomField, type AmoLead, type AmoNote, type AmoUser } from "../lib/amo";
import { humanMinutes, median, minutesBetween, share } from "../lib/stats";

/// Системные статусы amoCRM: успешно реализовано и закрыто без успеха.
const WON = 142;
const LOST = 143;
/// Обращение считается необработанным, если по нему два часа не было звонка.
const UNHANDLED_AFTER_MIN = 120;
/// Порог быстрого ответа: всё, что дольше, в недвижимости уже остывает.
const SLOW_REPLY_MIN = 30;

const SOURCE_FIELD = /utm|источник|source|канал|откуда|реклам/i;

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function fmtShare(value: number | null): string {
  return value === null ? "нет данных" : `${value}%`;
}

async function collect<T>(source: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

async function main() {
  const days = arg("days", 90);
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);

  console.log(`Читаю amoCRM за последние ${days} дней. Это займёт несколько минут.\n`);

  const fields = await collect(
    amoList<AmoCustomField>("/api/v4/leads/custom_fields", "custom_fields", {}),
  );
  const sourceFields = fields.filter((field) => SOURCE_FIELD.test(field.name));

  const leads = await collect(
    amoList<AmoLead>("/api/v4/leads", "leads", {
      filter: { created_at: { from: since, to: now } },
      with: "contacts",
    }),
  );
  console.log(`Сделок за период: ${leads.length}`);

  const users = await collect(amoList<AmoUser>("/api/v4/users", "users", {}));
  const userName = new Map(users.map((user) => [user.id, user.name]));

  // Звонки лежат примечаниями и на сделке, и на контакте — какой вариант
  // использует телефония, зависит от интеграции, поэтому читаем оба.
  const leadNotes = await collect(
    amoList<AmoNote>("/api/v4/leads/notes", "notes", {
      filter: { updated_at: { from: since, to: now } },
    }),
  );
  const contactNotes = await collect(
    amoList<AmoNote>("/api/v4/contacts/notes", "notes", {
      filter: { updated_at: { from: since, to: now } },
    }),
  );

  const isCall = (note: AmoNote) => note.note_type === "call_in" || note.note_type === "call_out";
  const calls = [...leadNotes, ...contactNotes].filter(isCall);
  const outgoing = calls.filter((note) => note.note_type === "call_out");

  // Контакт может быть привязан к нескольким сделкам: звонок засчитывается
  // каждой из них, иначе часть сделок останется без первого контакта.
  const leadsByContact = new Map<number, number[]>();
  for (const lead of leads) {
    for (const contact of lead._embedded?.contacts ?? []) {
      leadsByContact.set(contact.id, [...(leadsByContact.get(contact.id) ?? []), lead.id]);
    }
  }

  const firstCallByLead = new Map<number, number>();
  const remember = (leadId: number, at: number) => {
    const known = firstCallByLead.get(leadId);
    if (known === undefined || at < known) firstCallByLead.set(leadId, at);
  };

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  for (const note of leadNotes.filter((n) => n.note_type === "call_out")) {
    const lead = leadById.get(note.entity_id);
    if (lead && note.created_at >= lead.created_at) remember(lead.id, note.created_at);
  }
  for (const note of contactNotes.filter((n) => n.note_type === "call_out")) {
    for (const leadId of leadsByContact.get(note.entity_id) ?? []) {
      const lead = leadById.get(leadId);
      if (lead && note.created_at >= lead.created_at) remember(leadId, note.created_at);
    }
  }

  const delays: number[] = [];
  for (const lead of leads) {
    const first = firstCallByLead.get(lead.id);
    if (first !== undefined) delays.push(minutesBetween(lead.created_at, first));
  }

  const withoutCall = leads.filter((lead) => !firstCallByLead.has(lead.id));
  const openWithoutCall = withoutCall.filter(
    (lead) =>
      lead.status_id !== WON &&
      lead.status_id !== LOST &&
      minutesBetween(lead.created_at, now) > UNHANDLED_AFTER_MIN,
  );
  const slow = delays.filter((minutes) => minutes > SLOW_REPLY_MIN);

  const filled = (lead: AmoLead, fieldId: number) =>
    (lead.custom_fields_values ?? []).some(
      (value) => value.field_id === fieldId && value.values?.some((v) => v.value !== null && v.value !== ""),
    );
  const sourceStats = sourceFields.map((field) => ({
    name: field.name,
    filled: leads.filter((lead) => filled(lead, field.id)).length,
  }));
  const withAnySource = leads.filter((lead) =>
    sourceFields.some((field) => filled(lead, field.id)),
  ).length;

  const telephony = new Map<string, number>();
  for (const call of calls) {
    const name = call.params?.source ?? "не указана";
    telephony.set(name, (telephony.get(name) ?? 0) + 1);
  }

  const byManager = new Map<number, { total: number; answered: number; delays: number[] }>();
  for (const lead of leads) {
    const stat = byManager.get(lead.responsible_user_id) ?? { total: 0, answered: 0, delays: [] };
    stat.total += 1;
    const first = firstCallByLead.get(lead.id);
    if (first !== undefined) {
      stat.answered += 1;
      stat.delays.push(minutesBetween(lead.created_at, first));
    }
    byManager.set(lead.responsible_user_id, stat);
  }

  const lines: string[] = [];
  const say = (line = "") => {
    lines.push(line);
    console.log(line);
  };

  say(`# Диагностика amoCRM — ${new Date().toLocaleDateString("ru-RU")}`);
  say();
  say(`Период: последние ${days} дней. Сделок: **${leads.length}**.`);
  say();
  say("## 1. Источник обращения");
  say();
  if (sourceFields.length === 0) {
    say("**Полей источника в сделке нет вообще.** Считать CPL по каналам не из чего:");
    say("до фазы «Реклама» в amoCRM нужно завести поля источника и UTM-меток.");
  } else {
    say("| Поле | Заполнено | Доля |");
    say("|---|---:|---:|");
    for (const stat of sourceStats) {
      say(`| ${stat.name} | ${stat.filled} | ${fmtShare(share(stat.filled, leads.length))} |`);
    }
    say();
    say(`Хотя бы одно поле источника заполнено у **${fmtShare(share(withAnySource, leads.length))}** сделок.`);
  }
  say();
  say("## 2. Звонки и телефония");
  say();
  if (calls.length === 0) {
    say("**Звонков в amoCRM нет ни одного.** Телефония с CRM не связана, и время");
    say("первого контакта не существует в природе — блок «Обработка» построить нельзя,");
    say("пока менеджеры звонят мимо системы. Это блокер фазы 1.");
  } else {
    say(`Звонков за период: **${calls.length}**, из них исходящих: **${outgoing.length}**.`);
    say();
    say("| Телефония | Звонков |");
    say("|---|---:|");
    for (const [name, count] of [...telephony].sort((a, b) => b[1] - a[1])) {
      say(`| ${name} | ${count} |`);
    }
  }
  say();
  say("## 3. Скорость реакции");
  say();
  say(`- Медиана времени до первого исходящего звонка: **${humanMinutes(median(delays))}**`);
  say(`- Сделок с исходящим звонком: **${delays.length}** из ${leads.length} (${fmtShare(share(delays.length, leads.length))})`);
  say(`- Ответ дольше ${SLOW_REPLY_MIN} минут: **${fmtShare(share(slow.length, delays.length))}**`);
  say(`- Открытых сделок без единого звонка дольше ${UNHANDLED_AFTER_MIN / 60} часов: **${openWithoutCall.length}**`);
  say();
  say("## 4. По ответственным");
  say();
  say("| Менеджер | Сделок | С звонком | Медиана ответа |");
  say("|---|---:|---:|---:|");
  for (const [id, stat] of [...byManager].sort((a, b) => b[1].total - a[1].total)) {
    say(
      `| ${userName.get(id) ?? `id ${id}`} | ${stat.total} | ${fmtShare(share(stat.answered, stat.total))} | ${humanMinutes(median(stat.delays))} |`,
    );
  }
  say();
  say("---");
  say();
  say("Отчёт построен только по данным amoCRM. Сделки, не доехавшие до CRM,");
  say("в нём не видны: их расхождение проверяется сверкой с телефонией и формами сайта.");

  mkdirSync("reports", { recursive: true });
  const file = `reports/diagnose-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`\nОтчёт сохранён: ${file}`);
}

try {
  process.loadEnvFile(".env");
} catch {
  // .env может отсутствовать — тогда переменные берутся из окружения.
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
