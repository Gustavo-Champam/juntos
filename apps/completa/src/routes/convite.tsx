import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AppSkeleton } from "@/components/app-shell";
import { IdentityFrame, LoginCard } from "@/components/identity";
import { profileFrom } from "@/lib/profile";
import { acceptInvitation } from "@/lib/space";
import { useSpaceBootstrap } from "@/components/space-gate";

type ConviteSearch = { code?: string };

export const Route = createFileRoute("/convite")({
  validateSearch: (search: Record<string, unknown>): ConviteSearch => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: InvitePage,
});

function InvitePage() {
  const { code: searchCode } = Route.useSearch();
  const { user, isPending, query } = useSpaceBootstrap();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(searchCode ?? "");
  const [error, setError] = useState("");
  const callbackURL = searchCode ? `/convite?code=${encodeURIComponent(searchCode)}` : "/convite";

  useEffect(() => {
    if (searchCode) setCode(searchCode);
  }, [searchCode]);

  const accept = useMutation({
    mutationFn: () => acceptInvitation({ data: { code, ...profileFrom(user!) } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      await navigate({ to: "/" });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Não foi possível usar este convite.");
    },
  });

  if (isPending) return <AppSkeleton message="Preparando o convite…" />;
  if (!user) {
    return (
      <IdentityFrame>
        <LoginCard callbackURL={callbackURL} />
      </IdentityFrame>
    );
  }
  if (query.isPending) return <AppSkeleton message="Abrindo o espaço de vocês…" />;
  if (query.data?.space) return <Navigate to="/" />;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setError("Cole o código que você recebeu.");
      return;
    }
    setError("");
    accept.mutate();
  }

  return (
    <IdentityFrame>
      <section className="identity-card" aria-labelledby="accept-title">
        <p className="eyebrow">Convite para vocês</p>
        <h1 id="accept-title">Entrar no espaço compartilhado.</h1>
        <p>Use o código de uma vez. Depois os dois veem a mesma rotina.</p>
        <form className="identity-form" onSubmit={submit} noValidate>
          <label htmlFor="invite-code">Código do convite</label>
          <input
            id="invite-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoComplete="off"
            placeholder="ABCD-EFGH"
          />
          {error ? <p role="alert">{error}</p> : null}
          <button className="identity-action" type="submit" disabled={accept.isPending}>
            {accept.isPending ? "Entrando…" : "Entrar no espaço"}
          </button>
        </form>
        <p className="identity-note">
          Ainda não tem convite? <Link to="/comecar">Criar um espaço</Link>
        </p>
      </section>
    </IdentityFrame>
  );
}
