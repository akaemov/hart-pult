import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

/// Хеш пароля — scrypt с параметрами из рекомендаций OWASP (N=2^17, r=8, p=1).
/// Параметры записываются в саму строку: если их придётся поднять,
/// старые хеши продолжат проверяться со своими, а новые пойдут с новыми.
/// Формат: scrypt$<log2 N>$<r>$<p>$<соль>$<ключ>

const LOG_N = 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt расходует 128·N·r байт памяти; лимит по умолчанию в Node меньше.
    const maxmem = 256 * n * r;
    scryptCallback(password, salt, KEY_LENGTH, { N: n, r, p, maxmem }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 2 ** LOG_N, R, P);
  return ["scrypt", LOG_N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, logN, r, p, salt, key] = parts;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(
    password,
    Buffer.from(salt, "base64url"),
    2 ** Number(logN),
    Number(r),
    Number(p),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/// Пароль выдаётся системой, а не придумывается: 24 символа из 144 бит случайности.
export function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}
