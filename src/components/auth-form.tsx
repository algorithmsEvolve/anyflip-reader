"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  login,
  register,
  type AuthState,
} from "@/app/auth/actions";

type AuthFormProps = {
  mode: "login" | "register";
  nextPath: string;
};

const initialState: AuthState = { error: "" };

function SubmitButton({ mode }: Pick<AuthFormProps, "mode">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
    </button>
  );
}

export function AuthForm({ mode, nextPath }: AuthFormProps) {
  const [state, action] = useActionState(
    mode === "login" ? login : register,
    initialState,
  );

  return (
    <form className="auth-form" action={action}>
      <input type="hidden" name="next" value={nextPath} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
      />
      <p className="form-error" role="alert" aria-live="polite">
        {state.error}
      </p>
      <SubmitButton mode={mode} />
      <p className="auth-switch">
        {mode === "login" ? "No account yet?" : "Already registered?"}{" "}
        <Link href={mode === "login" ? "/register" : "/login"}>
          {mode === "login" ? "Create one" : "Log in"}
        </Link>
      </p>
    </form>
  );
}
