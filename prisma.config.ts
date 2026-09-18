import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Теневая база нужна только `prisma migrate dev` на машине разработчика.
    // На сервере её нет, и требовать переменную там нельзя: без этой проверки
    // падает даже `prisma generate`, а с ним и вся установка зависимостей.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: env("SHADOW_DATABASE_URL") }
      : {}),
  },
});
