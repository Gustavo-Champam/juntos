import { createFileRoute } from "@tanstack/react-router";
import { MealsScreen } from "@/components/meals-screen";
import { SpaceGate } from "@/components/space-gate";

export const Route = createFileRoute("/comidas")({ component: MealsPage });

function MealsPage() {
  return (
    <SpaceGate currentPath="/comidas">
      <MealsScreen />
    </SpaceGate>
  );
}
