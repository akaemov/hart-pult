/// Разбор полей и тегов amoCRM: что занято, что пусто и что можно убрать.
///
///   npm run amo:cleanup          — отчёт, ничего не меняет
///
/// Удаление поля уносит с собой все его значения, удаление тега — все его
/// пометки, и вернуть их нельзя. Поэтому скрипт только считает и раскладывает
/// по кучкам, а решение принимает человек по списку.
import "../lib/load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { amoGet, amoList, type AmoLead } from "../lib/amo";

type Field = { id: number; name: string; type: string; enums?: { id: number; value: string }[] };
type Tag = { id: number; name: string };

/// Поля, на которых стоит пульт. Их удаление ломает окна, поэтому они
/// помечаются отдельно, даже если заполнены плохо.
const USED_BY_PULT = [/^ЖК$/i, /^Источник заявки$/i, /^ID Помещения$/i];

/// Поля, которые заполняет не человек, а интеграция: аналитика сайта,
/// коллтрекинг, телефония. Пустое такое поле не значит ненужное — значит,
/// интеграция пока молчит. Решение по ним принимает владелец интеграции.
const INTEGRATION = [/^utm_/i, /^openstat_/i, /^ДКТ:/i, /^ЦОВ:/i, /^MANGO/i, /^roistat$/i,
  /^gclid$/i, /^yclid$/i, /^fbclid$/i, /^gclientid$/i, /^_ym_/i, /^from$/i, /^referrer$/i];

const matches = (name: string, list: RegExp[]) => list.some((re) => re.test(name.trim()));

async function main() {
  const fields: Field[] = [];
  for await (const field of amoList<Field>("/api/v4/leads/custom_fields", "custom_fields")) {
    fields.push(field);
  }

  const tagList = await amoGet<{ _embedded?: { tags?: Tag[] } }>("/api/v4/leads/tags", { limit: 250 });
  const tags = tagList?._embedded?.tags ?? [];

  console.log(`Полей сделки: ${fields.length}, тегов: ${tags.length}\n`);
  console.log("Считаю использование по всем сделкам аккаунта…");

  const fieldUse = new Map<number, number>();
  const tagUse = new Map<string, number>();
  let leads = 0;

  // Без фильтра по дате: тег, которым пометили сделку два года назад, всё ещё
  // используется, и удалять его вслепую нельзя.
  for await (const lead of amoList<AmoLead>("/api/v4/leads", "leads", { with: "tags" })) {
    leads++;
    for (const field of lead.custom_fields_values ?? []) {
      const filled = (field.values ?? []).some((item) => String(item.value ?? "").trim() !== "");
      if (filled) fieldUse.set(field.field_id, (fieldUse.get(field.field_id) ?? 0) + 1);
    }
    for (const tag of lead._embedded?.tags ?? []) {
      tagUse.set(tag.name, (tagUse.get(tag.name) ?? 0) + 1);
    }
  }

  console.log(`Сделок просмотрено: ${leads}\n`);

  const empty = fields.filter((field) => (fieldUse.get(field.id) ?? 0) === 0);
  const emptyOwn = empty.filter((f) => !matches(f.name, INTEGRATION) && !matches(f.name, USED_BY_PULT));
  const emptyIntegration = empty.filter((f) => matches(f.name, INTEGRATION));

  console.log(`=== Пустые поля, ничьи — кандидаты на удаление: ${emptyOwn.length}`);
  for (const f of emptyOwn) console.log(`   ${f.id}  ${f.name} (${f.type})`);

  console.log(`\n=== Пустые поля интеграций — спросить владельца: ${emptyIntegration.length}`);
  for (const f of emptyIntegration) console.log(`   ${f.id}  ${f.name}`);

  console.log(`\n=== Занятые поля: ${fields.length - empty.length}`);
  for (const f of fields.filter((x) => (fieldUse.get(x.id) ?? 0) > 0).sort((a, b) => (fieldUse.get(b.id) ?? 0) - (fieldUse.get(a.id) ?? 0))) {
    const mark = matches(f.name, USED_BY_PULT) ? " ← нужно пульту" : "";
    console.log(`   ${String(fieldUse.get(f.id)).padStart(5)}  ${f.name}${mark}`);
  }

  const unused = tags.filter((tag) => (tagUse.get(tag.name) ?? 0) === 0);
  console.log(`\n=== Теги, не стоящие ни на одной сделке — кандидаты на удаление: ${unused.length}`);
  for (const t of unused) console.log(`   ${t.id}  «${t.name}»`);

  console.log(`\n=== Теги в работе: ${tags.length - unused.length}`);
  for (const t of tags.filter((x) => (tagUse.get(x.name) ?? 0) > 0).sort((a, b) => (tagUse.get(b.name) ?? 0) - (tagUse.get(a.name) ?? 0))) {
    console.log(`   ${String(tagUse.get(t.name)).padStart(5)}  ${t.name}`);
  }

  mkdirSync("reports", { recursive: true });
  const file = `reports/amo-cleanup-${new Date().toISOString().slice(0, 10)}.csv`;
  const lines = [["Тип", "id", "Название", "Сделок", "Вывод"].join(";")];
  for (const f of fields) {
    const used = fieldUse.get(f.id) ?? 0;
    const verdict = used > 0 ? "занято" : matches(f.name, INTEGRATION) ? "пусто, интеграция" : matches(f.name, USED_BY_PULT) ? "пусто, нужно пульту" : "пусто, ничьё";
    lines.push(["поле", f.id, `"${f.name}"`, used, verdict].join(";"));
  }
  for (const t of tags) {
    const used = tagUse.get(t.name) ?? 0;
    lines.push(["тег", t.id, `"${t.name}"`, used, used > 0 ? "в работе" : "не используется"].join(";"));
  }
  writeFileSync(file, "﻿" + lines.join("\r\n"), "utf8");
  console.log(`\nПострочно: ${file}`);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
