import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { IdentityFrame, LoginCard } from "@/components/identity";
import type { AppUser } from "@/lib/auth/use-current-user";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { profileFrom } from "@/lib/profile";
import { getBootstrap } from "@/lib/space";
import { AppShell, AppSkeleton } from "./app-shell";

const rootRoute = getRouteApi("__root__");

function userFromSession(session: { id: string; email: string | null } | null): AppUser | null {
  if (!session) return null;
  return {
    id: session.id,
    displayName: session.email,
    primaryEmail: session.email,
    profileImageUrl: null,
    isDevFallback: false,
  };
}

export function useSpaceBootstrap() {
  const { sessionUser } = rootRoute.useRouteContext();
  const { user, isPending } = useCurrentUserState();
  const effectiveUser = user ?? userFromSession(sessionUser);
  const query = useQuery({
    queryKey: ["bootstrap", effectiveUser?.id],
    enabled: Boolean(effectiveUser),
    queryFn: () => getBootstrap({ data: profileFrom(effectiveUser!) }),
  });
  return {
    user: effectiveUser,
    isPending: isPending && !sessionUser,
    query,
  };
}

export function SpaceGate({
  children,
  currentPath,
}: {
  children: ReactNode;
  currentPath: string;
}) {
  const { user, isPending, query } = useSpaceBootstrap();

  if (isPending) return <AppSkeleton />;
  if (!user) {
    return (
      <IdentityFrame>
        <LoginCard callbackURL={currentPath} />
      </IdentityFrame>
    );
  }
  if (query.isPending) return <AppSkeleton message="Abrindo o espaço de vocês…" />;
  if (query.isError) {
    return (
      <IdentityFrame>
        <section className="identity-card">
          <p className="eyebrow">Algo falhou</p>
          <h1>Não foi possível abrir o espaço.</h1>
          <p>Verifique a conexão e tente de novo.</p>
          <button className="identity-action" type="button" onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </section>
      </IdentityFrame>
    );
  }
  if (!query.data?.space) return <Navigate to="/comecar" />;

  return (
    <AppShell currentPath={currentPath} user={query.data.user} space={query.data.space}>
      {children}
    </AppShell>
  );
}
