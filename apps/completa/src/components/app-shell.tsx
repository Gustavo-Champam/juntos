import { Heart, Settings2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { primaryNavigation } from "@/lib/navigation";
import type { CoupleSpace, SpaceMember } from "@/lib/types";

type AppShellProps = {
  children: ReactNode;
  currentPath?: string;
  user?: SpaceMember;
  space?: CoupleSpace | null;
};

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <Heart size={13} strokeWidth={2.4} />
    </span>
  );
}

export function AppShell({ children, currentPath = "/", user, space }: AppShellProps) {
  const initial = user?.name.slice(0, 1).toUpperCase() ?? "J";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo-principal">
        Pular para o conteúdo
      </a>

      <header className="shell-header">
        <Link className="brand" to="/" aria-label="Juntos — página inicial">
          <BrandMark />
          <span className="brand-word">Juntos</span>
        </Link>

        <Link className="profile-button" to="/perfil" aria-label="Abrir perfil e configurações">
          <span className="profile-pair">
            <span className="profile-user-avatar">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                initial
              )}
            </span>
            <span>{space?.memberCount === 2 ? "2" : "+"}</span>
          </span>
          <span className="profile-copy">
            <strong>{user?.name ?? "Seu espaço"}</strong>
            <small>{space?.name ?? "Perfil e ajustes"}</small>
          </span>
          <Settings2 className="profile-settings-icon" size={17} aria-hidden="true" />
        </Link>
      </header>

      <nav className="primary-navigation" aria-label="Navegação principal">
        {primaryNavigation.map(({ label, href, icon: Icon }) => (
          <Link
            className="navigation-link"
            to={href}
            aria-current={href === currentPath ? "page" : undefined}
            key={href}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <main id="conteudo-principal" className="shell-content">
        {children}
      </main>
    </div>
  );
}

export function AppSkeleton({ message = "Preparando sua entrada…" }: { message?: string }) {
  return (
    <main className="identity-page">
      <div className="identity-brand">
        <BrandMark />
        <span className="brand-word">Juntos</span>
      </div>
      <section className="identity-card" aria-busy="true">
        <p className="eyebrow">Juntos, com calma</p>
        <h1>Um lugar para a rotina de vocês.</h1>
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
        <p className="identity-note">{message}</p>
      </section>
    </main>
  );
}
