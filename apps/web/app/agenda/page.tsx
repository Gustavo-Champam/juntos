import { AppShell } from "@/components/app-shell";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { AgendaBoard } from "@/components/agenda-board";
import { getBootstrap } from "@/lib/server/bootstrap";
import { redirect } from "next/navigation";

export default async function AgendaPage() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "needs-space") redirect("/comecar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/agenda" />;
  return (
    <AppShell currentPath="/agenda" user={state.bootstrap.user} space={state.bootstrap.space}>
      <AgendaBoard />
    </AppShell>
  );
}
