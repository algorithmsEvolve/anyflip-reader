import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { createServerClient } from "@/lib/supabase/server";

export default async function RegisterPage() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/library");

  return (
    <main className="auth-page">
      <a className="back-link" href="/">Back to reader</a>
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="wordmark">Pagekeeper</p>
        <h1 id="auth-title">Build your shelf.</h1>
        <p>Create an account to save books and reading progress.</p>
        <AuthForm mode="register" nextPath="/library" />
      </section>
    </main>
  );
}
