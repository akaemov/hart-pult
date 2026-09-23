/// Перенос данных из тегов amoCRM в поля «ЖК» и «Источник заявки».
///
///   npm run amo:tags                  — отчёт: что изменится, ничего не пишет
///   npm run amo:tags -- --days 420    — глубина выборки, по умолчанию 420 дней
///   npm run amo:tags -- --apply       — записать в amoCRM
///
/// Разовая операция, запускается руками. По умолчанию не пишет ничего: сначала
/// отчёт, потом решение человека, и только потом --apply. Заполненные поля
/// не трогает никогда — значение, поставленное руками, вернее тега.
import "../lib/load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { amoList, amoPatch, type AmoLead } from "../lib/amo";
import {
  classifyTag,
  NEW_SOURCE_OPTIONS,
  planLead,
  type LeadTags,
  type Plan,
} from "../lib/amo-tags";

type Field = { id: number; name: string; type: string; enums?: { id: number; value: string }[] };

const OBJECT_FIELD = "ЖК";
const SOURCE_FIELD = "Источник заявки";

/// amoCRM принимает до 250 сущностей за запрос.
const BATCH = 250;

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function fields(): Promise<{ object: Field; source: Field }> {
  const all: Field[] = [];
  for await (const field of amoList<Field>("/api/v4/leads/custom_fields", "custom_fields")) {
    all.push(field);
  }

  const object = all.find((field) => field.name.trim() === OBJECT_FIELD);
  const source = all.find((field) => field.name.trim() === SOURCE_FIELD);
  if (!object) throw new Error(`В amoCRM нет поля «${OBJECT_FIELD}» — проверьте название.`);
  if (!source) throw new Error(`В amoCRM нет поля «${SOURCE_FIELD}» — проверьте название.`);

  return { object, source };
}

/// Значение поля у сделки, как его видит amoCRM: пустое поле приходит либо
/// отсутствующим, либо с пустой строкой внутри.
function valueOf(lead: AmoLead, fieldId: number): string | null {
  const field = (lead.custom_fields_values ?? []).find((item) => item.field_id === fieldId);
  const value = (field?.values ?? []).map((item) => String(item.value ?? "").trim()).find((item) => item !== "");
  return value ?? null;
}

/// Завести в справочнике «Источник заявки» значения, которых там нет.
///
/// Отдельным шагом и отдельным флагом: это правка настроек чужой CRM, а не
/// данных, и делать её заодно с переносом нельзя — человек должен сначала
/// увидеть список и согласиться.
async function addOptions(field: Field): Promise<number> {
  const have = new Set((field.enums ?? []).map((item) => item.value.trim().toLowerCase()));
  const missing = NEW_SOURCE_OPTIONS.filter((value) => !have.has(value.toLowerCase()));

  if (missing.length === 0) {
    console.log("Все значения уже заведены — справочник трогать не нужно.\n");
    return 0;
  }

  console.log(`Завожу значения «${SOURCE_FIELD}»: ${missing.join(", ")}`);
  await amoPatch(`/api/v4/leads/custom_fields/${field.id}`, {
    enums: [
      ...(field.enums ?? []).map((item) => ({ id: item.id, value: item.value })),
      ...missing.map((value) => ({ value })),
    ],
  });
  console.log(`Готово: добавлено ${missing.length}.\n`);
  return missing.length;
}

async function main() {
  const days = arg("days", 420);
  const apply = process.argv.includes("--apply");
  const from = Math.floor(Date.now() / 1000) - days * 86400;

  console.log(`Разбор тегов за ${days} дней${apply ? " — С ЗАПИСЬЮ В amoCRM" : " (только отчёт)"}…\n`);

  let { object: objectField, source: sourceField } = await fields();

  if (process.argv.includes("--add-options")) {
    const added = await addOptions(sourceField);
    // Новые значения получают id только на стороне amoCRM — перечитываем поле,
    // иначе писать будет нечем.
    if (added > 0) ({ object: objectField, source: sourceField } = await fields());
  }

  const options = new Map((sourceField.enums ?? []).map((item) => [item.value.trim(), item.id]));

  const leads: AmoLead[] = [];
  for await (const lead of amoList<AmoLead>("/api/v4/leads", "leads", {
    filter: { created_at: { from } },
    with: "tags",
  })) {
    leads.push(lead);
  }

  const tagged = leads.filter((lead) => (lead._embedded?.tags ?? []).length > 0);
  console.log(`Сделок за период: ${leads.length}, из них с тегами: ${tagged.length}`);

  const writes: { id: number; plan: Plan; lead: AmoLead }[] = [];
  const conflicts = new Map<string, { field: string; values: string[]; leads: number[] }>();
  const undecided = new Map<string, number>();
  const missingOptions = new Set<string>();

  for (const lead of tagged) {
    const tags = (lead._embedded?.tags ?? []).map((tag) => tag.name);
    for (const tag of tags) {
      if (classifyTag(tag).kind === "undecided") undecided.set(tag, (undecided.get(tag) ?? 0) + 1);
    }

    const input: LeadTags = {
      id: lead.id,
      tags,
      object: valueOf(lead, objectField.id),
      source: valueOf(lead, sourceField.id),
    };

    const plan = planLead(input);

    for (const conflict of plan.conflicts) {
      const key = `${conflict.field}: ${conflict.values.join(" и ")}`;
      const row = conflicts.get(key) ?? { field: conflict.field, values: conflict.values, leads: [] };
      row.leads.push(lead.id);
      conflicts.set(key, row);
    }

    // Значение списка, которого нет в справочнике, записать нельзя: сначала
    // его заводят в amoCRM, иначе поле молча останется пустым.
    if (plan.source && !options.has(plan.source)) {
      missingOptions.add(plan.source);
      plan.source = null;
    }

    if (plan.object === null && plan.source === null) continue;
    writes.push({ id: lead.id, plan, lead });
  }

  const byObject = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const { plan } of writes) {
    if (plan.object) byObject.set(plan.object, (byObject.get(plan.object) ?? 0) + 1);
    if (plan.source) bySource.set(plan.source, (bySource.get(plan.source) ?? 0) + 1);
  }

  console.log(`\nБудет заполнено «${OBJECT_FIELD}»: ${[...byObject.values()].reduce((a, b) => a + b, 0)}`);
  for (const [value, count] of [...byObject].sort((a, b) => b[1] - a[1])) console.log(`   ${value}: ${count}`);

  console.log(`\nБудет заполнено «${SOURCE_FIELD}»: ${[...bySource.values()].reduce((a, b) => a + b, 0)}`);
  for (const [value, count] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`   ${value}: ${count}`);

  if (conflicts.size > 0) {
    const rows = [...conflicts.entries()].sort((a, b) => b[1].leads.length - a[1].leads.length);
    const total = rows.reduce((sum, [, row]) => sum + row.leads.length, 0);
    console.log(`\nПоля, оставленные пустыми из-за противоречия в тегах: ${total}`);
    for (const [key, row] of rows.slice(0, 12)) {
      console.log(`   ${String(row.leads.length).padStart(4)}  ${key}`);
    }
    if (rows.length > 12) console.log(`   …и ещё ${rows.length - 12} сочетаний`);
  }

  if (missingOptions.size > 0) {
    console.log(`\nНет значения в справочнике «${SOURCE_FIELD}»: ${[...missingOptions].join(", ")}`);
    console.log("   Заведите их в amoCRM и запустите снова.");
  }

  if (undecided.size > 0) {
    console.log(`\nТеги без правила — ${undecided.size} штук. Решение за вами, скрипт их не трогает:`);
    for (const [tag, count] of [...undecided].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(count).padStart(4)}  ${tag}`);
    }
  }

  mkdirSync("reports", { recursive: true });
  const file = `reports/amo-tags-${new Date().toISOString().slice(0, 10)}.csv`;
  const lines = [["Сделка", "Название", "Теги", "ЖК", "Источник заявки"].join(";")];
  for (const { id, plan, lead } of writes) {
    const tags = (lead._embedded?.tags ?? []).map((tag) => tag.name).join(" ");
    lines.push([id, `"${lead.name.replaceAll('"', '""')}"`, tags, plan.object ?? "", plan.source ?? ""].join(";"));
  }
  writeFileSync(file, "﻿" + lines.join("\r\n"), "utf8");
  console.log(`\nПострочный список: ${file} (${writes.length} сделок)`);

  if (!apply) {
    console.log("\nНичего не записано. Чтобы применить: npm run amo:tags -- --apply");
    return;
  }

  console.log(`\nЗапись в amoCRM: ${writes.length} сделок…`);
  let done = 0;

  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = writes.slice(i, i + BATCH).map(({ id, plan }) => ({
      id,
      custom_fields_values: [
        ...(plan.object
          ? [{ field_id: objectField.id, values: [{ value: plan.object }] }]
          : []),
        ...(plan.source
          ? [{ field_id: sourceField.id, values: [{ enum_id: options.get(plan.source)! }] }]
          : []),
      ],
    }));

    await amoPatch("/api/v4/leads", batch);
    done += batch.length;
    console.log(`   записано ${done} из ${writes.length}`);
  }

  console.log("\nГотово. Проверьте несколько сделок в amoCRM и запустите сбор: npm run sync -- amocrm --days 420");
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
