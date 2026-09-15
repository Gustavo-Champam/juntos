import { createFileRoute } from "@tanstack/react-router";
import { SpaceGate } from "@/components/space-gate";
import { TimelineView } from "@/components/timeline-view";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <SpaceGate currentPath="/">
      <TimelineView />
    </SpaceGate>
  );
}
