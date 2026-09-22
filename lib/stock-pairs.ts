/// Сопоставление проектов-копий «ДЛЯ АВИТО» с основными проектами Profitbase.
///
/// Сток у застройщика ведётся дважды: «ЖК Заря» и её копия «ЗАРЯ ДЛЯ АВИТО»,
/// «ПьермÓнт» и «ПЬЕРМОНТ ДЛЯ АВИТО». Фиды Авито кормятся из копий, продажи
/// отмечаются в основных проектах, и связь между ними держится только на
/// названиях. Поэтому она собрана в одном месте и проверена тестами: сломается
/// она молча — окно просто покажет ноль расхождений.

/// Названия написаны по-разному даже внутри одного кабинета: «ПьермÓнт»
/// с латинской O с ударением, «ЖК Заря» с префиксом. Приводим к общему виду.
const LOOKALIKES: Record<string, string> = {
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у",
  k: "к", m: "м", t: "т", b: "в", h: "н",
};

export function normalizeProject(name: string): string {
  return name
    .normalize("NFD")
    // Убираем диакритику отдельным диапазоном: Ó распадается на O и знак
    // ударения, и без этого латинская O с ударением остаётся чужой буквой.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[a-z]/g, (letter) => LOOKALIKES[letter] ?? letter)
    .replace(/ё/g, "е")
    .replace(/для\s+авито/g, " ")
    // Границы слова \b в JavaScript кириллицу не видят, поэтому «жк» отрезаем
    // по пробелам и краям строки.
    .replace(/(^|\s)жк(\s|$)/g, " ")
    .replace(/[^а-я0-9]+/g, " ")
    .trim();
}

export function isFeedCopy(name: string): boolean {
  return /для\s+авито/i.test(name);
}

/// Название секции в копии помечено: «Секция Б (для фидов Авито)». Для
/// сопоставления пометка лишняя — секция-то та же самая. Регистр сохраняется:
/// это же название стоит в окне, и «Секция Б» там уместнее, чем «секция б».
export function normalizeHouse(name: string): string {
  return name
    .replace(/\(\s*для\s+фидов\s+авито\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ProjectPair = { copy: string; main: string };

/// Пары «копия → основной проект». Проект без пары не выбрасывается молча:
/// он возвращается отдельно, и окно скажет, что по нему сверить не с чем.
export function pairProjects(names: string[]): {
  pairs: ProjectPair[];
  unpaired: string[];
} {
  const unique = [...new Set(names)];
  const copies = unique.filter(isFeedCopy);
  const mains = unique.filter((name) => !isFeedCopy(name));

  const pairs: ProjectPair[] = [];
  const unpaired: string[] = [];

  for (const copy of copies) {
    const key = normalizeProject(copy);
    const main = mains.find((candidate) => normalizeProject(candidate) === key);
    if (main) pairs.push({ copy, main });
    else unpaired.push(copy);
  }

  return { pairs, unpaired };
}
