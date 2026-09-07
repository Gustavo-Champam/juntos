import { AcceptInvitation } from "@/components/onboarding/accept-invitation";
import { BootstrapUnavailable } from "@/components/bootstrap-unavailable";
import { getBootstrap } from "@/lib/server/bootstrap";

export default async function InvitationPage() {
  const state = await getBootstrap();
  if (state.status === "unavailable") return <BootstrapUnavailable retryHref="/convite?retomar=1" />;
  return <main className="identity-page"><AcceptInvitation /></main>;
}
