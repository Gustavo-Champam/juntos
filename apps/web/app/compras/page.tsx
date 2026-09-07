import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { ShoppingContent } from "@/components/shopping-content";
import { getBootstrap } from "@/lib/server/bootstrap";

export default async function ShoppingPage() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "needs-space") redirect("/comecar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/compras" />;

  return (
    <AppShell currentPath="/compras" user={state.bootstrap.user} space={state.bootstrap.space}>
      <ShoppingContent />
    </AppShell>
  );
}
