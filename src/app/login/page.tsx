import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { safeNextPath } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/library");

  const query = await searchParams;
  const nextPath = safeNextPath(
    Array.isArray(query.next) ? query.next[0] : query.next,
  );

  return (
    <main className="auth-page">
      <LinkHome />
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="wordmark">Pagekeeper</p>
        <h1 id="auth-title">Welcome back.</h1>
        <p>Log in to continue your saved books.</p>
        <AuthForm mode="login" nextPath={nextPath} />
      </section>
    </main>
  );
}

function LinkHome() {
  return <a className="back-link" href="/">Back to reader</a>;
}
