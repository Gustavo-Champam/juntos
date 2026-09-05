"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function LogoutButton({ fetcher = fetch }: Readonly<{ fetcher?: Fetcher }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetcher("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/entrar");
    } catch {
      setError("Não foi possível sair da conta. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return <><button className="quiet-button" type="button" onClick={logout} disabled={pending}>{pending ? "Saindo…" : "Sair da conta"}</button>{error ? <p role="alert">{error}</p> : null}<p className="visually-hidden" aria-live="polite">{pending ? "Saindo da conta" : ""}</p></>;
}
