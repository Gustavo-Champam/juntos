"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function CreateSpaceForm({ fetcher = fetch }: Readonly<{ fetcher?: Fetcher }>) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Dê um nome para o espaço de vocês.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetcher("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? "Não foi possível criar o espaço. Tente novamente.");
        return;
      }
      router.replace("/");
    } catch {
      setError("Não foi possível criar o espaço. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="identity-form" onSubmit={submit} noValidate>
      <label htmlFor="space-name">Nome do espaço</label>
      <input id="space-name" name="name" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={error ? "space-error" : undefined} aria-invalid={Boolean(error)} autoComplete="off" />
      {error ? <p id="space-error" role="alert">{error}</p> : null}
      <button className="identity-action" type="submit" disabled={pending}>{pending ? "Criando espaço…" : "Criar espaço"}</button>
      <p className="visually-hidden" aria-live="polite">{pending ? "Criando espaço" : ""}</p>
    </form>
  );
}
