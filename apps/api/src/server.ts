import "dotenv/config";

import { OAuth2Client } from "google-auth-library";

import { buildApp } from "./app.js";
import { parseConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import {
  GoogleIdentityAdapter,
  type GoogleOAuthClient,
} from "./identity/google-identity.js";
import { PostgresIdentityStore } from "./identity/postgres-identity-store.js";
import { SessionService } from "./identity/session-service.js";
import { SpaceService } from "./spaces/space-service.js";

const config = parseConfig(process.env);
const pool = createPool(config.databaseUrl, config.databaseSsl);
const store = new PostgresIdentityStore(pool);
const sessionService = new SessionService(store);
const spaceService = new SpaceService(store);
const oauthClient = new OAuth2Client({
  clientId: config.googleClientId,
  clientSecret: config.googleClientSecret,
  redirectUri: config.googleRedirectUri,
});
const googleOAuthClient: GoogleOAuthClient = {
  getToken: async (options) => oauthClient.getToken(options),
  verifyIdToken: async (options) => oauthClient.verifyIdToken(options),
};
const googleIdentity = new GoogleIdentityAdapter(googleOAuthClient, {
  clientId: config.googleClientId,
  redirectUri: config.googleRedirectUri,
});
const app = buildApp({
  webOrigin: config.webOrigin,
  identity: {
    internalProxyKey: config.internalProxyKey,
    googleIdentity,
    sessionService,
    spaceService,
  },
});

app.addHook("onClose", async () => {
  await pool.end();
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
