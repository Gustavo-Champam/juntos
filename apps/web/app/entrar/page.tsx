import { redirect } from "next/navigation";

import { LoginCard } from "@/components/auth/login-card";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { getBootstrap } from "@/lib/server/bootstrap";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const params = await searchParams;
  const state = await getBootstrap();
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/entrar" />;
  if (state.status === "ready") redirect("/");
  if (state.status === "needs-space") redirect("/comecar");
  return (
    <main className="identity-page">
      <LoginCard error={params.erro} />
    </main>
  );
}
