import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AppSkeleton } from "@/components/app-shell";
import { IdentityFrame, LoginCard } from "@/components/identity";
import { profileFrom } from "@/lib/profile";
import { createSpace } from "@/lib/space";
import { useSpaceBootstrap } from "@/components/space-gate";

export const Route = createFileRoute("/comecar")({ component: StartPage });

function StartPage() {
  const { user, isPending, query } = useSpaceBootstrap();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => createSpace({ data: { spaceName: name, ...profileFrom(user!) } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      await navigate({ to: "/" });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Não foi possível criar o espaço.");
    },
  });

  if (isPending) return <AppSkeleton message="Preparando o espaço…" />;
  if (!user) {
    return (
      <IdentityFrame>
        <LoginCard callbackURL="/comecar" />
      </IdentityFrame>
    );
  }
  if (query.isPending) return <AppSkeleton message="Abrindo o espaço de vocês…" />;
  if (query.data?.space) return <Navigate to="/" />;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Dê um nome para o espaço de vocês.");
      return;
    }
    setError("");
    create.mutate();
  }

  return (
    <IdentityFrame>
      <section className="identity-card" aria-labelledby="start-title">
        <p className="eyebrow">O primeiro passo</p>
        <h1 id="start-title">Deem um nome ao espaço de vocês.</h1>
        <p>Ele guarda a rotina que vocês vão construir juntos.</p>
        <form className="identity-form" onSubmit={submit} noValidate>
          <label htmlFor="space-name">Nome do espaço</label>
          <input
            id="space-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            maxLength={80}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "space-error" : undefined}
          />
          {error ? (
            <p id="space-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="identity-action" type="submit" disabled={create.isPending}>
            {create.isPending ? "Criando espaço…" : "Criar espaço"}
          </button>
        </form>
        <p className="identity-note">
          Já tem um convite? <Link to="/convite">Entrar no espaço</Link>
        </p>
      </section>
    </IdentityFrame>
  );
}
