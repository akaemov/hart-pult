import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "./password";

/// scrypt с параметрами OWASP берёт 134 МБ и около секунды на один хеш.
/// В одиночку тест укладывается в стандартные пять секунд, но в полном прогоне
/// десяток процессов считают его одновременно, и лимит перестаёт хватать —
/// тест начинает падать через раз. Отсюда свой, заведомо щедрый лимит.
const SCRYPT_TIMEOUT_MS = 30_000;

describe("пароли", () => {
  it("верный пароль проходит, неверный — нет", async () => {
    const hash = await hashPassword("правильный пароль");
    expect(await verifyPassword("правильный пароль", hash)).toBe(true);
    expect(await verifyPassword("неправильный", hash)).toBe(false);
  }, SCRYPT_TIMEOUT_MS);

  it("одинаковые пароли дают разные хеши", async () => {
    const [a, b] = await Promise.all([hashPassword("один"), hashPassword("один")]);
    expect(a).not.toBe(b);
  }, SCRYPT_TIMEOUT_MS);

  it("параметры записаны в хеш", async () => {
    expect(await hashPassword("x")).toMatch(/^scrypt\$17\$8\$1\$[\w-]+\$[\w-]+$/);
  }, SCRYPT_TIMEOUT_MS);

  it("испорченная строка хеша не проходит и не роняет проверку", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$10$abc")).toBe(false);
  }, SCRYPT_TIMEOUT_MS);

  it("сгенерированный пароль — 24 символа без спецсимволов", () => {
    expect(generatePassword()).toMatch(/^[\w-]{24}$/);
  });
});
