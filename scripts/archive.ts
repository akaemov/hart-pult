/// Архив amoCRM перед изменениями в CRM.
///
/// Удаление поля или тега в amoCRM стирает данные без возможности вернуть,
/// поэтому перед любой чисткой снимается полная копия: все сделки аккаунта
/// без ограничения по датам, все значения полей, все теги и справочники.
///
///   npm run archive              # в ./archives
///   npm run archive -- /путь     # в указанный каталог
import "../lib/load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { amoList, type AmoLead, type AmoPipeline, type AmoUser } from "../lib/amo";

type ArchiveLead = AmoLead & {
  updated_at?: number;
  closed_at?: number | null;
  _embedded?: { contacts?: { id: number }[]; tags?: { id: number; name: string }[] };
};

async function collect<T>(source: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

async function main() {
  const dir = process.argv[2] ?? "archives";
  mkdirSync(dir, { recursive: true });

  console.log("Справочники…");
  const fields = await collect(amoList("/api/v4/leads/custom_fields", "custom_fields"));
  const contactFields = await collect(amoList("/api/v4/contacts/custom_fields", "custom_fields"));
  const tags = await collect(amoList("/api/v4/leads/tags", "tags"));
  const users = await collect(amoList<AmoUser>("/api/v4/users", "users"));
  const pipelines = await collect(amoList<AmoPipeline>("/api/v4/leads/pipelines", "pipelines"));

  // Без фильтра по дате: чистка затронет и сделки, которых нет в окне сбора.
  console.log("Все сделки аккаунта…");
  const leads = await collect(amoList<ArchiveLead>("/api/v4/leads", "leads", { with: "tags,contacts" }));

  const values = leads.reduce(
    (sum, lead) => sum + (lead.custom_fields_values ?? []).length + (lead._embedded?.tags ?? []).length,
    0,
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const file = join(dir, `amocrm-${stamp}.json.gz`);
  writeFileSync(
    file,
    gzipSync(
      JSON.stringify({
        takenAt: new Date().toISOString(),
        counts: { leads: leads.length, fields: fields.length, tags: tags.length, values },
        fields,
        contactFields,
        tags,
        users,
        pipelines,
        leads,
      }),
    ),
  );

  console.log(`\nСделок: ${leads.length}, значений полей и тегов: ${values}`);
  console.log(`Архив: ${file}`);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
