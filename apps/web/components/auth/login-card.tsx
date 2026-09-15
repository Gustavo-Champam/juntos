export function LoginCard({ error }: { error?: string }) {
  return (
    <section className="identity-card" aria-labelledby="login-title">
      <p className="eyebrow">Juntos, com calma</p>
      <h1 id="login-title">Um lugar para a rotina de vocês.</h1>
      <p>Entre para organizar o dia a dia a dois, sem misturar contas.</p>
      {error ? (
        <p role="alert">
          O Google ainda não está configurado neste site. No Vercel, faltam as variáveis
          GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI e INTERNAL_PROXY_KEY.
        </p>
      ) : null}
      <a className="identity-action" href="/api/auth/google/start">
        <span className="google-mark" aria-hidden="true">G</span>
        Continuar com Google
      </a>
      <p className="identity-note">Cada pessoa entra com a própria conta do Google.</p>
    </section>
  );
}
