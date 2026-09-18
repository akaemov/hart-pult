import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Отдельная база под теневую: с ней снова работает `prisma migrate dev`,
    // и миграции больше не нужно собирать вручную через `migrate diff`.
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
});
