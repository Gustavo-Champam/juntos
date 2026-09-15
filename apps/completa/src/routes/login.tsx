import { createFileRoute, Navigate } from "@tanstack/react-router";
import { IdentityFrame, LoginCard } from "@/components/identity";
import { AppSkeleton } from "@/components/app-shell";
import { useSpaceBootstrap } from "@/components/space-gate";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, isPending, query } = useSpaceBootstrap();
  if (isPending) return <AppSkeleton message="Preparando sua entrada…" />;
  if (!user) {
    return (
      <IdentityFrame>
        <LoginCard />
      </IdentityFrame>
    );
  }
  if (query.isPending) return <AppSkeleton message="Abrindo o espaço de vocês…" />;
  if (query.data?.space) return <Navigate to="/" />;
  return <Navigate to="/comecar" />;
}
