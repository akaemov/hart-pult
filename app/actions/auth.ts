"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/next-path";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { formatTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type LoginState = { error: string | null; email: string };

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

const credentials = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

// Для несуществующей почты пароль всё равно проверяется — против хеша-пустышки.
// Иначе по времени ответа можно перебором выяснить, какие адреса заведены.
let decoyHash: Promise<string> | undefined;
function decoy() {
  decoyHash ??= hashPassword("выравнивание времени ответа");
  return decoyHash;
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = credentials.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: "Введите почту и пароль.", email };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return {
      error: `Слишком много неудачных попыток. Вход откроется в ${formatTime(user.lockedUntil)}.`,
      email,
    };
  }

  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await decoy()));

  if (!user || !valid) {
    if (user) {
      const { failedLogins } = await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: { increment: 1 } },
      });
      if (failedLogins >= MAX_FAILURES) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
        });
      }
    }
    return { error: "Неверная почта или пароль.", email };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });
  await createSession(user.id);
  redirect(safeNextPath(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
