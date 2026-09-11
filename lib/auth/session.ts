import "server-only";
import { cookies } from "next/headers";
import { prisma } from "../prisma";
import { SESSION_COOKIE } from "./cookie";
import { generateSessionToken, hashSessionToken } from "./token";

const SESSION_DAYS = 14;

export async function createSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // На localhost без HTTPS Safari не отдаёт Secure-cookie обратно.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}
