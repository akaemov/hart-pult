import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/next-path";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await props.searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            HartDevelopment
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">Пульт</h1>
        </div>
        <LoginForm next={safeNextPath(next)} />
        <p className="text-sm text-ink-3">
          Регистрации нет — доступ выдаёт владелец пульта.
        </p>
      </div>
    </main>
  );
}
