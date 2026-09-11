/// Завести пользователя пульта или сбросить ему пароль. Самостоятельной
/// регистрации нет: доступ выдаёт владелец. Пароль генерируется и печатается
/// один раз — сохраните его сразу.
///
///   npm run user:add -- --email owner@example.ru --name "Имя Фамилия" --role OWNER
///   npm run user:add -- --email owner@example.ru --reset
///
/// --reset выдаёт новый пароль, снимает блокировку и завершает все сессии.
/// Роли: OWNER, COMMERCIAL, SALES_HEAD, VIEWER.
import "dotenv/config";
import { Role } from "../app/generated/prisma/enums";
import { generatePassword, hashPassword } from "../lib/auth/password";
import { prisma } from "../lib/prisma";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  if (!email) throw new Error("Укажите --email");

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  if (process.argv.includes("--reset")) {
    const user = await prisma.user.update({
      where: { email },
      data: { passwordHash, failedLogins: 0, lockedUntil: null, sessions: { deleteMany: {} } },
    });
    console.log(`Пароль для ${user.email} сброшен, все сессии завершены.`);
  } else {
    const name = arg("name");
    const role = arg("role");
    if (!name) throw new Error("Укажите --name");
    if (!role || !(role in Role)) {
      throw new Error(`Укажите --role: ${Object.keys(Role).join(", ")}`);
    }
    await prisma.user.create({ data: { email, name, role: role as Role, passwordHash } });
    console.log(`Пользователь ${email} создан, роль ${role}.`);
  }

  console.log(`Пароль: ${password}`);
  console.log("Он показан один раз и нигде не хранится в открытом виде.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
