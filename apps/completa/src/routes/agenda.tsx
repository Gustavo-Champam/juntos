import { createFileRoute } from "@tanstack/react-router";
import { AgendaScreen } from "@/components/agenda-screen";
import { SpaceGate } from "@/components/space-gate";

type AgendaSearch = { new?: string };

export const Route = createFileRoute("/agenda")({
  validateSearch: (search: Record<string, unknown>): AgendaSearch => ({
    new: typeof search.new === "string" ? search.new : undefined,
  }),
  component: AgendaPage,
});

function AgendaPage() {
  const { new: openNew } = Route.useSearch();
  return (
    <SpaceGate currentPath="/agenda">
      <AgendaScreen openNew={openNew === "1"} />
    </SpaceGate>
  );
}
