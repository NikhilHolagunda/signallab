"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { api, refreshSession, session } from "@/lib/api";
import type { AuthResponse, User } from "@/lib/types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = React.createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * Session bootstrap: on load we try a silent refresh (httpOnly cookie -> fresh access
 * token in memory). Nothing about the session is ever stored in JS-readable storage.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = React.useState<Status>("loading");
  const [user, setUser] = React.useState<User | null>(null);

  const accept = React.useCallback((res: AuthResponse) => {
    session.set(res.accessToken);
    setUser(res.user);
    setStatus("authenticated");
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    refreshSession().then((res) => {
      if (cancelled) return;
      if (res) accept(res);
      else setStatus("anonymous");
    });
    return () => {
      cancelled = true;
    };
  }, [accept]);

  React.useEffect(() => {
    session.onLost(() => {
      session.set(null);
      setUser(null);
      setStatus("anonymous");
      if (pathname?.startsWith("/app")) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });
  }, [pathname, router]);

  const value: AuthState = {
    status,
    user,
    setUser,
    login: async (email, password) => accept(await api.login(email, password)),
    register: async (email, password, displayName) => accept(await api.register(email, password, displayName)),
    logout: async () => {
      try {
        await api.logout();
      } finally {
        session.set(null);
        setUser(null);
        setStatus("anonymous");
        router.replace("/");
      }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Protected-route wrapper: renders children only with a live session. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname ?? "/app")}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="grid h-dvh place-items-center">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-muted">
          <span className="size-2 animate-pulse-dot rounded-full bg-cyan" />
          {status === "loading" ? "Restoring session" : "Redirecting"}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
