import { Heart, Settings2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CoupleSpace, PublicUser } from "@juntos/contracts";

import { primaryNavigation } from "@/lib/navigation";

type AppShellProps = Readonly<{
  children: ReactNode;
  currentPath?: string;
  user?: PublicUser;
  space?: CoupleSpace;
}>;

export function AppShell({ children, currentPath = "/", user, space }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo-principal">
        Pular para o conteúdo
      </a>

      <header className="shell-header">
        <Link className="brand" href="/" aria-label="Juntos — página inicial">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <Heart size={13} strokeWidth={2.4} />
          </span>
          <span className="brand-word">Juntos</span>
        </Link>

        <Link
          className="profile-button"
          href="/perfil"
          aria-label="Abrir perfil e configurações"
        >
          <span className="profile-pair" aria-hidden="true">
            <span>{user?.name.slice(0, 1) ?? "J"}</span>
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
            href={href}
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
