"use client";

import { Copy } from "lucide-react";
import { useState, type FormEvent } from "react";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ClipboardApi = Pick<Clipboard, "writeText">;
type Invitation = { token: string; expiresAt: string };

export function InvitationCard({ memberCount = 1, fetcher = fetch, clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard }: Readonly<{ memberCount?: 1 | 2; fetcher?: Fetcher; clipboard?: ClipboardApi }>) {
  const [email, setEmail] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [showLink, setShowLink] = useState(false);
  const invitationUrl = invitation ? `/convite#token=${invitation.token}` : "";

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage("");
    setShowLink(false);
    try {
      const response = await fetcher("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email.trim() ? { invitedEmail: email.trim() } : {}),
      });
      if (!response.ok) throw new Error();
      setInvitation(await response.json() as Invitation);
      setMessage("Convite criado.");
    } catch {
      setMessage("Não foi possível criar o convite. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    try {
      if (!clipboard) throw new Error();
      await clipboard.writeText(invitationUrl);
      setMessage("Convite copiado.");
    } catch {
      setShowLink(true);
      setMessage("Não foi possível copiar. Selecione o link abaixo.");
    }
  }

  if (memberCount === 2) return <section className="invitation-card"><p className="eyebrow">Espaço completo</p><h2>As duas pessoas já estão juntas.</h2><p>Não é preciso criar outro convite.</p></section>;

  return (
    <section className="invitation-card" aria-labelledby="invite-title">
      <p className="eyebrow">Trazer a outra pessoa</p>
      <h2 id="invite-title">Um convite, quando fizer sentido.</h2>
      <form className="identity-form" onSubmit={generate} noValidate>
        <label htmlFor="invited-email">E-mail da pessoa (opcional)</label>
        <input id="invited-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        <button className="identity-action" type="submit" disabled={pending}>{pending ? "Gerando convite…" : invitation ? "Gerar novo convite" : "Gerar convite"}</button>
      </form>
      {invitation ? <div className="invitation-actions"><p>Expira em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(invitation.expiresAt))}.</p><button className="quiet-button" type="button" onClick={copy}><Copy size={17} aria-hidden="true" /> Copiar convite</button>{showLink ? <input className="selectable-link" aria-label="Link do convite" value={invitationUrl} readOnly onFocus={(event) => event.currentTarget.select()} /> : null}</div> : null}
      <p aria-live="polite">{message}</p>
    </section>
  );
}
