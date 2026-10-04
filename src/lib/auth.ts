export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/library";

  try {
    const url = new URL(value, "https://pagekeeper.local");
    return url.origin === "https://pagekeeper.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/library";
  } catch {
    return "/library";
  }
}

export function authErrorMessage(mode: "login" | "register"): string {
  return mode === "login"
    ? "Invalid email or password."
    : "Unable to create account.";
}
