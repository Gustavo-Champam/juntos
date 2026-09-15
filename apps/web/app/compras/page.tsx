import { AppShell } from "@/components/app-shell";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { ShoppingBoard } from "@/components/shopping-board";
import { getBootstrap } from "@/lib/server/bootstrap";
import { redirect } from "next/navigation";

export default async function ShoppingPage() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "needs-space") redirect("/comecar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/compras" />;

  return (
    <AppShell currentPath="/compras" user={state.bootstrap.user} space={state.bootstrap.space}>
      <ShoppingBoard />
    </AppShell>
  );
}
