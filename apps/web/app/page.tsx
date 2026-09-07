import { AppShell } from "@/components/app-shell";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { TimelineView } from "@/components/timeline-view";
import { getBootstrap } from "@/lib/server/bootstrap";
import { redirect } from "next/navigation";
import {
  demoDate,
  demoEvents,
  demoMeals,
} from "@/features/timeline/demo-data";

export default async function Home() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/" />;
  if (state.status === "needs-space") redirect("/comecar");
  return (
    <AppShell user={state.bootstrap.user} space={state.bootstrap.space}>
      <TimelineView
        initialDate={demoDate}
        events={demoEvents}
        meals={demoMeals}
      />
    </AppShell>
  );
}
