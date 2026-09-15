import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { UserButton } from "@/lib/auth/gates";
import type { ReactNode } from "react";
import { BrandMark } from "./app-shell";

export function IdentityFrame({ children }: { children: ReactNode }) {
  return (
    <main className="identity-page">
      <div className="identity-brand">
        <BrandMark />
        <span className="brand-word">Juntos</span>
      </div>
      {children}
    </main>
  );
}

export function LoginCard({ callbackURL = "/" }: { callbackURL?: string }) {
  return (
    <section className="identity-card" aria-labelledby="login-title">
      <p className="eyebrow">Juntos, com calma</p>
      <h1 id="login-title">Um lugar para a rotina de vocês.</h1>
      <p>Agenda, cardápio e compras num espaço só de vocês dois, sem misturar contas.</p>
      <ol className="landing-steps">
        <li>
          <span className="step-index">1</span>
          <div>
            <strong>Entre com a sua conta</strong>
            <span>Cada pessoa usa o próprio login.</span>
          </div>
        </li>
        <li>
          <span className="step-index">2</span>
          <div>
            <strong>Criem o espaço do casal</strong>
            <span>Deem um nome. Ele guarda o dia a dia de vocês.</span>
          </div>
        </li>
        <li>
          <span className="step-index">3</span>
          <div>
            <strong>Convide com um código</strong>
            <span>Um convite, uma vez, válido por sete dias.</span>
          </div>
        </li>
      </ol>
      <div className="provider-stack">
        {GROK_PROVIDERS.map((provider) => (
          <button
            key={provider.providerId}
            className="identity-action"
            type="button"
            onClick={() => signIn(provider.providerId, { callbackURL })}
          >
            <span className="google-mark" aria-hidden="true">
              {provider.idp === "google" ? "G" : "X"}
            </span>
            Continuar com {provider.label}
          </button>
        ))}
      </div>
      <p className="identity-note">A outra pessoa entra com a conta dela e aceita o convite.</p>
    </section>
  );
}

export function ProfileSignOut() {
  return (
    <div className="signout-row">
      <UserButton />
    </div>
  );
}
