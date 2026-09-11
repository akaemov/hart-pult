import { logout } from "@/app/actions/auth";
import type { CurrentUser } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";

export function PultHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold tracking-tight">Пульт</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
            HartDevelopment
          </span>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <span className="text-ink-2">
            {user.name} · <span className="text-ink-3">{ROLE_LABELS[user.role]}</span>
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              Выйти
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
