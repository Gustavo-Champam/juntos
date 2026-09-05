"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function AcceptInvitation({ fetcher = fetch, startLogin = (url: string) => window.location.assign(url) }: Readonly<{ fetcher?: Fetcher; startLogin?: (url: string) => void }>) {
  const router = useRouter();
  const [state, setState] = useState<"preparing" | "ready" | "accepting" | "error">("preparing");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const resumed = new URLSearchParams(window.location.search).get("retomar") === "1";
    if (!token) {
      void Promise.resolve().then(() => setState(resumed ? "ready" : "error"));
      return;
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void fetcher("/api/invitations/preserve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then((response) => setState(response.ok ? "ready" : "error"))
      .catch(() => setState("error"));
  }, [fetcher]);

  async function accept() {
    if (state !== "ready") return;
    setState("accepting");
    try {
      const response = await fetcher("/api/invitations/accept", { method: "POST" });
      if (response.status === 401) {
        startLogin("/api/auth/google/start?returnTo=%2Fconvite%3Fretomar%3D1");
        return;
      }
      if (!response.ok) throw new Error();
      router.replace("/");
    } catch {
      setState("error");
    }
  }

  const error = state === "error";
  return <section className="identity-card" aria-labelledby="accept-title"><p className="eyebrow">Convite para vocês</p><h1 id="accept-title">Entrar no espaço compartilhado.</h1><p>{error ? "Este convite não está disponível. Peça um novo convite à outra pessoa." : "Estamos preparando seu convite com segurança."}</p>{error ? <p role="alert">Não foi possível usar este convite.</p> : <button className="identity-action" type="button" onClick={accept} disabled={state !== "ready"}>{state === "accepting" ? "Entrando…" : "Entrar no espaço"}</button>}<p aria-live="polite">{state === "preparing" ? "Preparando convite" : ""}</p></section>;
}
