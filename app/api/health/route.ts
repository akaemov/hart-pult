import { prisma } from "@/lib/prisma";

/// Для мониторинга на сервере: жив ли процесс и отвечает ли база.
/// Без авторизации и без каких-либо данных в ответе.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
