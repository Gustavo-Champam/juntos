type BootstrapUnavailableProps = Readonly<{ retryHref: string }>;

export function BootstrapUnavailable({ retryHref }: BootstrapUnavailableProps) {
  return (
    <main className="identity-page">
      <section className="identity-card bootstrap-unavailable" aria-labelledby="bootstrap-unavailable-title" role="alert">
        <p className="eyebrow">Uma pausa breve</p>
        <h1 id="bootstrap-unavailable-title">Não foi possível carregar agora.</h1>
        <p>Sua conta continua segura. Pode ser só uma instabilidade passageira.</p>
        <a className="identity-action" href={retryHref}>Tentar novamente</a>
      </section>
    </main>
  );
}
