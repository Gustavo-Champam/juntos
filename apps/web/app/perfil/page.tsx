import { redirect } from "next/navigation";
import Image from "next/image";

import { AppShell } from "@/components/app-shell";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { InvitationCard } from "@/components/onboarding/invitation-card";
import { LeaveSpaceForm } from "@/components/profile/leave-space-form";
import { LogoutButton } from "@/components/profile/logout-button";
import { getBootstrap } from "@/lib/server/bootstrap";

export default async function ProfilePage() {
  const state = await getBootstrap();
  if (state.status === "anonymous") redirect("/entrar");
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/perfil" />;
  if (state.status === "needs-space") redirect("/comecar");
  const { bootstrap } = state;
  return <AppShell currentPath="/perfil" user={bootstrap.user} space={bootstrap.space}><section className="profile-page" aria-labelledby="profile-title"><p className="eyebrow">O espaço de vocês</p><h1 id="profile-title">{bootstrap.space.name}</h1><section className="people-list" aria-labelledby="people-title"><h2 id="people-title">Pessoas</h2><article><span className="person-avatar">{bootstrap.user.avatarUrl ? <Image src={bootstrap.user.avatarUrl} alt="" width={42} height={42} unoptimized /> : bootstrap.user.name.slice(0, 1)}</span><div><strong>{bootstrap.user.name}</strong><span>{bootstrap.user.email}</span></div><small>{bootstrap.space.memberCount === 1 ? "owner" : "membro"}</small></article>{bootstrap.space.memberCount === 1 ? <p>Quando a outra pessoa entrar, ela aparece aqui.</p> : <p>Vocês dois fazem parte deste espaço.</p>}</section><InvitationCard memberCount={bootstrap.space.memberCount} /><section className="leave-section" aria-labelledby="leave-title"><p className="eyebrow">Precisa sair?</p><h2 id="leave-title">Deixar este espaço.</h2><p>As informações do outro membro continuam aqui.</p><LeaveSpaceForm spaceName={bootstrap.space.name} /></section><LogoutButton /></section></AppShell>;
}
