import { AppShell } from "@/components/app-shell";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { TimelineView } from "@/components/timeline-view";
import { getBootstrap } from "@/lib/server/bootstrap";
import { loadHomeDay } from "@/lib/server/live-data";
import { redirect } from "next/navigation";

export default async function Home() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/" />;
  if (state.status === "needs-space") redirect("/comecar");
  const day = await loadHomeDay();
  return (
    <AppShell user={state.bootstrap.user} space={state.bootstrap.space}>
      <TimelineView initialDate={day.date} events={day.events} meals={day.meals} />
    </AppShell>
  );
}
