import type { AuthCookie, CookieStore } from "./auth-cookies";

export function cookieJar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: AuthCookie[] = [];
  return {
    writes,
    get(name: string) { const value = values.get(name); return value === undefined ? undefined : { value }; },
    set(cookie: AuthCookie) {
      writes.push(cookie);
      if (cookie.maxAge === 0) values.delete(cookie.name);
      else values.set(cookie.name, cookie.value);
    },
  } satisfies CookieStore & { writes: AuthCookie[] };
}
