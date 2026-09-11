import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "./password";

describe("пароли", () => {
  it("верный пароль проходит, неверный — нет", async () => {
    const hash = await hashPassword("правильный пароль");
    expect(await verifyPassword("правильный пароль", hash)).toBe(true);
    expect(await verifyPassword("неправильный", hash)).toBe(false);
  });

  it("одинаковые пароли дают разные хеши", async () => {
    const [a, b] = await Promise.all([hashPassword("один"), hashPassword("один")]);
    expect(a).not.toBe(b);
  });

  it("параметры записаны в хеш", async () => {
    expect(await hashPassword("x")).toMatch(/^scrypt\$17\$8\$1\$[\w-]+\$[\w-]+$/);
  });

  it("испорченная строка хеша не проходит и не роняет проверку", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$10$abc")).toBe(false);
  });

  it("сгенерированный пароль — 24 символа без спецсимволов", () => {
    expect(generatePassword()).toMatch(/^[\w-]{24}$/);
  });
});
