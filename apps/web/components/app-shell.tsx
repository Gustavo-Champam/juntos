import { Heart, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CoupleSpace, PublicUser } from "@juntos/contracts";

import { RemindersHost } from "@/components/reminders-host";
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

      <aside className="shell-header">
        <Link className="brand" href="/" aria-label="Juntos — página inicial">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <Heart size={13} strokeWidth={2.4} />
          </span>
          <span className="brand-word">Juntos</span>
        </Link>

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

        <Link className="pedir-link" href="/pedir" aria-current={currentPath === "/pedir" ? "page" : undefined}>
          <Sparkles size={16} aria-hidden="true" />
          Pedir à IA
        </Link>

        <Link
          className="profile-button"
          href="/perfil"
          aria-label="Abrir perfil e configurações"
        >
          <span className="profile-pair">
            <span className="profile-user-avatar" aria-hidden={user?.avatarUrl ? undefined : true}>
              {user?.avatarUrl ? (
                // Google may serve profile photos from several hosts; keep this remote image outside Next's host allowlist.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={`Foto de ${user.name}`} referrerPolicy="no-referrer" />
              ) : (
                user?.name.slice(0, 1) ?? "J"
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
      </aside>

      <main id="conteudo-principal" className="shell-content">
        {children}
      </main>
      <RemindersHost />
    </div>
  );
}
