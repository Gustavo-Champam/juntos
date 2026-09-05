"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function AcceptInvitation({ fetcher = fetch }: Readonly<{ fetcher?: Fetcher }>) {
  const router = useRouter();
  const [state, setState] = useState<"preparing" | "ready" | "accepting" | "error">("preparing");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      void Promise.resolve().then(() => setState("error"));
      return;
    }
    void fetcher("/api/invitations/preserve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then((response) => setState(response.ok ? "ready" : "error"))
      .catch(() => setState("error"));
  }, [fetcher]);

  async function accept() {
    if (state !== "ready") return;
    setState("accepting");
    try {
      const response = await fetcher("/api/invitations/accept", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/");
    } catch {
      setState("error");
    }
  }

  const error = state === "error";
  return <section className="identity-card" aria-labelledby="accept-title"><p className="eyebrow">Convite para vocês</p><h1 id="accept-title">Entrar no espaço compartilhado.</h1><p>{error ? "Este convite não está disponível. Peça um novo convite à outra pessoa." : "Estamos preparando seu convite com segurança."}</p>{error ? <p role="alert">Não foi possível usar este convite.</p> : <button className="identity-action" type="button" onClick={accept} disabled={state !== "ready"}>{state === "accepting" ? "Entrando…" : "Entrar no espaço"}</button>}<p aria-live="polite">{state === "preparing" ? "Preparando convite" : ""}</p></section>;
}
