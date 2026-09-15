import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { SpaceGate, useSpaceBootstrap } from "@/components/space-gate";
import { ProfileSignOut } from "@/components/identity";
import { createInvitation, leaveSpace } from "@/lib/space";

export const Route = createFileRoute("/perfil")({ component: ProfilePage });

function ProfilePage() {
  return (
    <SpaceGate currentPath="/perfil">
      <ProfileContent />
    </SpaceGate>
  );
}

function ProfileContent() {
  const { query } = useSpaceBootstrap();
  const bootstrap = query.data;
  if (!bootstrap?.space) return null;
  const { user, space } = bootstrap;

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <p className="eyebrow">O espaço de vocês</p>
      <h1 id="profile-title">{space.name}</h1>

      <section className="people-list" aria-labelledby="people-title">
        <h2 id="people-title">Pessoas</h2>
        {space.members.map((member) => (
          <article key={member.id}>
            <span className="person-avatar">
              {member.avatarUrl ? <img src={member.avatarUrl} alt="" referrerPolicy="no-referrer" /> : member.name.slice(0, 1)}
            </span>
            <div>
              <strong>{member.name}</strong>
              <span>{member.email ?? (member.id === user.id ? "você" : "membro")}</span>
            </div>
            <small>{member.id === space.members[0]?.id ? "criou o espaço" : "membro"}</small>
          </article>
        ))}
        {space.memberCount === 1 ? <p>Quando a outra pessoa entrar, ela aparece aqui.</p> : <p>Vocês dois fazem parte deste espaço.</p>}
      </section>

      <InvitationPanel memberCount={space.memberCount} />
      <LeavePanel spaceName={space.name} />
      <ProfileSignOut />
    </section>
  );
}

function InvitationPanel({ memberCount }: { memberCount: 1 | 2 }) {
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: () => createInvitation({ data: {} }),
    onSuccess: (data) => {
      setInvitation(data);
      setStatus("Convite criado.");
      setError("");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Não foi possível criar o convite.");
    },
  });

  if (memberCount === 2) {
    return (
      <section className="invitation-card">
        <p className="eyebrow">Espaço completo</p>
        <h2>As duas pessoas já estão juntas.</h2>
        <p>Não é preciso criar outro convite.</p>
      </section>
    );
  }

  const inviteUrl =
    invitation && typeof window !== "undefined"
      ? new URL(`/convite?code=${encodeURIComponent(invitation.code)}`, window.location.origin).href
      : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatus("Convite copiado.");
    } catch {
      setError("Não foi possível copiar. Selecione o link abaixo.");
    }
  }

  return (
    <section className="invitation-card" aria-labelledby="invite-title">
      <p className="eyebrow">Trazer a outra pessoa</p>
      <h2 id="invite-title">Um convite, quando fizer sentido.</h2>
      <p>O código vale por 7 dias e só pode ser usado uma vez.</p>
      <button className="identity-action" type="button" onClick={() => create.mutate()} disabled={create.isPending}>
        {create.isPending ? "Gerando convite…" : invitation ? "Gerar novo convite" : "Gerar convite"}
      </button>
      {invitation ? (
        <div className="invitation-actions">
          <p>
            Código <strong>{invitation.code}</strong> · expira em{" "}
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(invitation.expiresAt))}
          </p>
          <button className="quiet-button" type="button" onClick={() => void copy()}>
            <Copy size={17} aria-hidden="true" /> Copiar link
          </button>
          <input className="selectable-link" aria-label="Link do convite" value={inviteUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <p aria-live="polite">{status}</p>
    </section>
  );
}

function LeavePanel({ spaceName }: { spaceName: string }) {
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const leave = useMutation({
    mutationFn: () => leaveSpace({ data: { confirmName } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate({ to: "/comecar" });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Não foi possível sair.");
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    leave.mutate();
  }

  return (
    <section className="leave-section" aria-labelledby="leave-title">
      <p className="eyebrow">Precisa sair?</p>
      <h2 id="leave-title">Deixar este espaço.</h2>
      <p>As informações do outro membro continuam aqui.</p>
      <form className="leave-form" onSubmit={submit}>
        <label htmlFor="confirm-space">Digite {spaceName} para confirmar</label>
        <input id="confirm-space" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} />
        {error ? <p role="alert">{error}</p> : null}
        <button className="danger-button" type="submit" disabled={leave.isPending}>
          {leave.isPending ? "Saindo…" : "Sair do espaço"}
        </button>
      </form>
    </section>
  );
}
