"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function LeaveSpaceForm({ spaceName, fetcher = fetch }: Readonly<{ spaceName: string; fetcher?: Fetcher }>) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const canLeave = confirmation === spaceName;

  async function leave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canLeave || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetcher("/api/spaces/leave", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/comecar");
    } catch {
      setError("Não foi possível sair agora. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return <form className="leave-form" onSubmit={leave}><label htmlFor="leave-confirmation">Digite <strong>{spaceName}</strong> para confirmar</label><input id="leave-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />{error ? <p role="alert">{error}</p> : null}<button className="danger-button" type="submit" disabled={!canLeave || pending}>{pending ? "Saindo…" : "Sair deste espaço"}</button><p aria-live="polite">{pending ? "Saindo do espaço" : ""}</p></form>;
}
