import { createFileRoute } from "@tanstack/react-router";
import { ShoppingScreen } from "@/components/shopping-screen";
import { SpaceGate } from "@/components/space-gate";

export const Route = createFileRoute("/compras")({ component: ShoppingPage });

function ShoppingPage() {
  return (
    <SpaceGate currentPath="/compras">
      <ShoppingScreen />
    </SpaceGate>
  );
}
