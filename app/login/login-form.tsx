"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

const initial: LoginState = { error: null, email: "" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Почта</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="field"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Пароль</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </label>
      {state.error && (
        <p role="alert" className="border-l-2 border-crit bg-crit-soft px-3 py-2 text-sm text-crit">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 bg-accent font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {pending ? "Проверяю…" : "Войти"}
      </button>
    </form>
  );
}
