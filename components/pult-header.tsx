import Link from "next/link";
import { logout } from "@/app/actions/auth";
import type { CurrentUser } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";

/// Вкладки пульта. Появляются по мере готовности: сейчас работают две,
/// остальные добавятся вместе со своими источниками.
const TABS = [
  { href: "/", label: "Обзор" },
  { href: "/processing", label: "Обработка" },
] as const;

export function PultHeader({ user, active }: { user: CurrentUser; active?: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-baseline gap-6">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="font-semibold tracking-tight">Пульт</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
              HartDevelopment
            </span>
          </Link>
          <nav className="flex items-baseline gap-4 text-sm">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.href === active ? "page" : undefined}
                className={
                  tab.href === active
                    ? "font-medium text-ink underline decoration-accent decoration-2 underline-offset-[7px]"
                    : "text-ink-2 hover:text-ink"
                }
              >
                {tab.label}
              </Link>
            ))}
          </nav>
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
