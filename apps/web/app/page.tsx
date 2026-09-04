import { AppShell } from "@/components/app-shell";
import { TimelineView } from "@/components/timeline-view";
import {
  demoDate,
  demoEvents,
  demoMeals,
} from "@/features/timeline/demo-data";

export default function Home() {
  return (
    <AppShell>
      <TimelineView
        initialDate={demoDate}
        events={demoEvents}
        meals={demoMeals}
      />
    </AppShell>
  );
}
