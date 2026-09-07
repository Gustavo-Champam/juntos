import { redirect } from "next/navigation";

import { CreateSpaceForm } from "@/components/onboarding/create-space-form";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { getBootstrap } from "@/lib/server/bootstrap";

export default async function StartPage() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/comecar" />;
  if (state.status === "ready") redirect("/");
  return <main className="identity-page"><section className="identity-card" aria-labelledby="start-title"><p className="eyebrow">O primeiro passo</p><h1 id="start-title">Deem um nome ao espaço de vocês.</h1><p>Ele guarda a rotina que vocês vão construir juntos.</p><CreateSpaceForm /></section></main>;
}
