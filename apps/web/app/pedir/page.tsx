import { AppShell } from "@/components/app-shell";
import { AssistantBoard } from "@/components/assistant-board";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { getBootstrap } from "@/lib/server/bootstrap";
import { redirect } from "next/navigation";

export default async function AssistantPage() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "needs-space") redirect("/comecar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/pedir" />;
  return (
    <AppShell currentPath="/pedir" user={state.bootstrap.user} space={state.bootstrap.space}>
      <AssistantBoard />
    </AppShell>
  );
}
