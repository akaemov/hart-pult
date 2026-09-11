import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./token";

describe("токен сессии", () => {
  it("каждый токен уникален", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it("хеш детерминирован и не совпадает с токеном", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
