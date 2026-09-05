import { redirect } from "next/navigation";

import { LoginCard } from "@/components/auth/login-card";
import { getBootstrap } from "@/lib/server/bootstrap";

export default async function LoginPage() {
  const state = await getBootstrap();
  if (state.status === "ready") redirect("/");
  if (state.status === "needs-space") redirect("/comecar");
  return <main className="identity-page"><LoginCard /></main>;
}
