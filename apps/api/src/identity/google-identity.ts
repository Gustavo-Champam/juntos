import type { GoogleExchangeRequest } from "@juntos/contracts";

export type GoogleIdTokenPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
};

export interface GoogleOAuthClient {
  getToken(options: {
    code: string;
    codeVerifier: string;
    redirect_uri: string;
  }): Promise<{
    tokens: {
      id_token?: string | null;
      access_token?: string | null;
      refresh_token?: string | null;
    };
  }>;
  verifyIdToken(options: {
    idToken: string;
    audience: string;
  }): Promise<{ getPayload(): GoogleIdTokenPayload | undefined }>;
}

type GoogleIdentityOptions = {
  clientId: string;
  redirectUri: string;
  now?: () => Date;
};

export type GoogleIdentity = {
  googleSubject: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

const allowedIssuers = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

function hasExpectedAudience(
  audience: string | string[] | undefined,
  clientId: string,
): boolean {
  return typeof audience === "string"
    ? audience === clientId
    : Array.isArray(audience) && audience.includes(clientId);
}

export class GoogleIdentityAdapter {
  constructor(
    private readonly client: GoogleOAuthClient,
    private readonly options: GoogleIdentityOptions,
  ) {}

  async exchange(request: GoogleExchangeRequest): Promise<GoogleIdentity> {
    const { tokens } = await this.client.getToken({
      code: request.code,
      codeVerifier: request.codeVerifier,
      redirect_uri: this.options.redirectUri,
    });
    if (!tokens.id_token) throw new Error("invalid Google identity");

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.options.clientId,
    });
    const payload = ticket.getPayload();
    const nowSeconds = Math.floor((this.options.now ?? (() => new Date()))().getTime() / 1000);
    if (
      !payload ||
      !payload.iss ||
      !allowedIssuers.has(payload.iss) ||
      !hasExpectedAudience(payload.aud, this.options.clientId) ||
      typeof payload.exp !== "number" ||
      payload.exp <= nowSeconds ||
      payload.nonce !== request.nonce ||
      payload.email_verified !== true ||
      !payload.sub?.trim() ||
      !payload.email?.trim() ||
      !payload.name?.trim()
    ) {
      throw new Error("invalid Google identity");
    }

    return {
      googleSubject: payload.sub.trim(),
      email: payload.email.trim().toLowerCase(),
      name: payload.name.trim(),
      avatarUrl: payload.picture?.trim() || null,
    };
  }
}
