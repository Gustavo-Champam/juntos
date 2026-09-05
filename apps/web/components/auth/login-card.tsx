export function LoginCard() {
  return (
    <section className="identity-card" aria-labelledby="login-title">
      <p className="eyebrow">Juntos, com calma</p>
      <h1 id="login-title">Um lugar para a rotina de vocês.</h1>
      <p>Entre para organizar o dia a dia a dois, sem misturar contas.</p>
      <a className="identity-action" href="/api/auth/google/start">
        <span className="google-mark" aria-hidden="true">G</span>
        Continuar com Google
      </a>
      <p className="identity-note">Cada pessoa entra com a própria conta do Google.</p>
    </section>
  );
}
