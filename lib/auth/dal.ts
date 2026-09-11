import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "../../app/generated/prisma/enums";
import { prisma } from "../prisma";
import { SESSION_COOKIE } from "./cookie";
import { hashSessionToken } from "./token";

/// Настоящая проверка доступа. proxy.ts смотрит только, есть ли cookie;
/// здесь сессия сверяется с базой — на каждой странице и в каждом действии.

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
