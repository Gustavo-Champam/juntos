import "server-only";

import { bootstrapSchema, type Bootstrap } from "@juntos/contracts";
import { cookies } from "next/headers";

import { backendFetch } from "./api-client";
import { cookieConfig, opaqueTokenPattern } from "./auth-cookies";

export type BootstrapState =
  | { status: "anonymous" }
  | { status: "unavailable" }
  | { status: "needs-space"; bootstrap: Bootstrap }
  | { status: "ready"; bootstrap: Bootstrap & { space: NonNullable<Bootstrap["space"]> } };

export async function getBootstrap(): Promise<BootstrapState> {
  const store = await cookies();
  const session = store.get(cookieConfig("session").name)?.value;
  if (!session || !opaqueTokenPattern.test(session)) return { status: "anonymous" };

  try {
    const response = await backendFetch("/internal/bootstrap", { method: "GET" }, session);
    if (response.status === 401) return { status: "anonymous" };
    if (!response.ok) return { status: "unavailable" };
    const bootstrap = bootstrapSchema.parse(await response.json());
    return bootstrap.space
      ? { status: "ready", bootstrap: { ...bootstrap, space: bootstrap.space } }
      : { status: "needs-space", bootstrap };
  } catch {
    return { status: "unavailable" };
  }
}
