import { backendFetch } from "@/lib/server/api-client";

import { createBackendHealthHandler } from "./route-core";

export const GET = createBackendHealthHandler(backendFetch);
