"use server";

import { redirect } from "next/navigation";

import { authErrorMessage, safeNextPath } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export type AuthState = { error: string };

function credentials(formData: FormData): {
  email: string;
  password: string;
  nextPath: string;
} | null {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@") || !password) return null;
  return {
    email,
    password,
    nextPath: safeNextPath(String(formData.get("next") ?? "")),
  };
}

export async function login(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const input = credentials(formData);
  if (!input) return { error: authErrorMessage("login") };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(input);
  const { data } = await supabase.auth.getUser();
  if (error || !data.user) return { error: authErrorMessage("login") };
  redirect(input.nextPath);
}

export async function register(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const input = credentials(formData);
  if (!input) return { error: authErrorMessage("register") };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  });
  const { data } = await supabase.auth.getUser();
  if (error || !data.user) return { error: authErrorMessage("register") };
  redirect(input.nextPath);
}

export async function logout(): Promise<never> {
  const supabase = await createServerClient();
  await supabase.auth.getUser();
  await supabase.auth.signOut();
  redirect("/");
}
