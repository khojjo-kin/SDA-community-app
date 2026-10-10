// Sign-in. The real app uses the same Clerk application as the iPhone app (the publishable key in
// the repository's .env), loaded from Clerk at start-up, so the same email and password work on both.
// Every Supabase request carries the Clerk session token, exactly as on the iPhone.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CLERK_KEY, setTokenGetter } from 'shared/supabase';
import { t } from './i18n';

declare const __DEMO__: boolean;

export type AuthUser = { id: string; email: string; name: string; imageUrl: string; username: string };

/** One of the accounts signed in on this computer. Clerk keeps one session per account (multi-session is on). */
export type Account = { sessionId: string; userId: string; username: string; name: string; imageUrl: string; current: boolean };

/** No more accounts than this on one computer, as on the iPhone. */
export const MAX_ACCOUNTS = 5;

type AuthState = {
  ready: boolean;
  error: string;
  user: AuthUser | null;
  demo: boolean;
  signOut: () => Promise<void>;
  /** Clerk's account screen: email addresses, password, connected accounts, sessions. */
  openAccount: () => void;
  /** Puts Clerk's sign-in or sign-up form into an element. Returns a function that removes it. */
  mountForm: (el: HTMLDivElement, mode: 'sign-in' | 'sign-up') => () => void;
  demoSignIn: () => void;
  /** Every account signed in here, the one in use first. */
  accounts: Account[];
  /** Moves to another signed-in account. The app starts again at Home as that account. */
  switchTo: (sessionId: string) => Promise<void>;
  /** Clerk's sign-in, to add another account alongside this one. */
  addAccount: () => void;
};

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => useContext(Ctx)!;

declare global {
  interface Window {
    Clerk?: any;
    __internal_ClerkUICtor?: any;
  }
}

function clerkHost(key: string): string {
  let host = '';
  try {
    host = atob(key.split('_').slice(2).join('_')).replace(/\$+$/, '');
  } catch {
    // reported below
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new Error('The Clerk publishable key in .env could not be read.');
  return host;
}

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(t('d.frame.signInUnreachable')));
    document.head.appendChild(s);
  });
}

function mapUser(u: any): AuthUser | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.primaryEmailAddress?.emailAddress ?? '',
    name: u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '',
    imageUrl: u.hasImage ? u.imageUrl : '',
    username: u.username ?? '',
  };
}

/** Clerk's forms, coloured to match the app. */
const appearance = {
  variables: {
    colorPrimary: '#1fbf5a',
    colorBackground: '#131920',
    colorText: '#f3f5f7',
    colorTextSecondary: '#a4adb9',
    colorInputBackground: '#1b222a',
    colorInputText: '#f3f5f7',
    colorNeutral: '#f3f5f7',
    borderRadius: '10px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  elements: { card: { boxShadow: 'none', border: '0' }, rootBox: { width: '100%' }, cardBox: { width: '100%', boxShadow: 'none' } },
};

// The demo has two sample accounts to switch between; the call test signs a second window in as
// another sample person through __fakeMe.
const DEMO_ACCOUNTS: Account[] = [
  { sessionId: 'demo_s1', userId: 'demo_me', username: 'you', name: 'Demo Account', imageUrl: '', current: false },
  { sessionId: 'demo_s2', userId: 'u_grace', username: 'grace_mensah', name: 'Grace Mensah', imageUrl: '', current: false },
];
const demoAs = (() => {
  try {
    return sessionStorage.getItem('community.demoAs') || '';
  } catch {
    return '';
  }
})();
if (__DEMO__ && demoAs && !(globalThis as any).__fakeMe) (globalThis as any).__fakeMe = demoAs;
const DEMO_USER: AuthUser = (() => {
  const id = ((globalThis as any).__fakeMe as string) || 'demo_me';
  const a = DEMO_ACCOUNTS.find((x) => x.userId === id);
  return { id, email: 'demo@example.com', name: a?.name ?? 'Demo Account', imageUrl: '', username: a?.username ?? 'you' };
})();

function clerkAccounts(): Account[] {
  const c = window.Clerk;
  const sessions: any[] = c?.client?.activeSessions ?? c?.client?.sessions?.filter((x: any) => x.status === 'active') ?? [];
  const list = sessions.map((x: any) => ({
    sessionId: x.id,
    userId: x.user?.id ?? '',
    username: x.user?.username || (x.user?.primaryEmailAddress?.emailAddress ?? '').split('@')[0],
    name: x.user?.fullName ?? '',
    imageUrl: x.user?.hasImage ? x.user.imageUrl : '',
    current: x.id === c?.session?.id,
  }));
  return list.sort((a, b) => Number(b.current) - Number(a.current));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (__DEMO__) {
      setUser(DEMO_USER);
      setReady(true);
      return;
    }
    let gone = false;
    (async () => {
      try {
        if (!CLERK_KEY) throw new Error('The Clerk publishable key is missing from .env.');
        const base = 'https://' + clerkHost(CLERK_KEY) + '/npm/';
        const tag = { 'data-clerk-publishable-key': CLERK_KEY };
        const here = location.origin + location.pathname;
        const options: any = { appearance, signInForceRedirectUrl: here, signUpForceRedirectUrl: here, afterSignOutUrl: here };
        try {
          // Current Clerk: the screens come as a separate bundle next to clerk-js.
          await loadScript(base + '@clerk/ui@1/dist/ui.browser.js');
          await loadScript(base + '@clerk/clerk-js@6/dist/clerk.browser.js', tag);
          if (window.__internal_ClerkUICtor) options.ui = { ClerkUI: window.__internal_ClerkUICtor };
        } catch (e) {
          if (window.Clerk) throw e;
          await loadScript(base + '@clerk/clerk-js@5/dist/clerk.browser.js', tag);
        }
        await window.Clerk.load(options);
        setTokenGetter(async () => (window.Clerk?.session ? window.Clerk.session.getToken() : null));
        if (gone) return;
        setUser(mapUser(window.Clerk.user));
        window.Clerk.addListener((s: any) => setUser(mapUser(s.user)));
        setReady(true);
      } catch (e: any) {
        if (!gone) {
          setError(e?.message || t('d.frame.signInFailed'));
          setReady(true);
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, []);

  const value: AuthState = {
    ready,
    error,
    user,
    demo: __DEMO__,
    async signOut() {
      if (__DEMO__) {
        try {
          sessionStorage.removeItem('community.demoAs');
        } catch {
          // nothing kept
        }
        setUser(null);
        return;
      }
      const others = clerkAccounts().filter((a) => !a.current);
      const current = window.Clerk.session?.id;
      if (others.length && current) {
        // Logging out of one account keeps the others signed in, as on the iPhone.
        await window.Clerk.signOut({ sessionId: current });
        await window.Clerk.setActive({ session: others[0].sessionId });
        location.hash = '#/';
        location.reload();
        return;
      }
      await window.Clerk.signOut({ redirectUrl: location.origin + location.pathname });
    },
    openAccount() {
      if (!__DEMO__) window.Clerk.openUserProfile({ appearance });
    },
    mountForm(el, mode) {
      if (__DEMO__ || !window.Clerk) return () => {};
      if (mode === 'sign-in') {
        window.Clerk.mountSignIn(el, { appearance, signUpUrl: '#/sign-up', routing: 'virtual' });
        return () => window.Clerk.unmountSignIn(el);
      }
      window.Clerk.mountSignUp(el, { appearance, signInUrl: '#/sign-in', routing: 'virtual' });
      return () => window.Clerk.unmountSignUp(el);
    },
    demoSignIn() {
      setUser(DEMO_USER);
    },
    accounts: __DEMO__ ? DEMO_ACCOUNTS.map((a) => ({ ...a, current: a.userId === DEMO_USER.id })).sort((a, b) => Number(b.current) - Number(a.current)) : user ? clerkAccounts() : [],
    async switchTo(sessionId) {
      if (__DEMO__) {
        const a = DEMO_ACCOUNTS.find((x) => x.sessionId === sessionId);
        try {
          sessionStorage.setItem('community.demoAs', a?.userId ?? '');
        } catch {
          // stays on this account
        }
        location.hash = '#/';
        location.reload();
        return;
      }
      await window.Clerk.setActive({ session: sessionId });
      // Starting again clears everything kept for the previous account: posts, chats, channels.
      location.hash = '#/';
      location.reload();
    },
    addAccount() {
      if (__DEMO__ || !window.Clerk) return;
      window.Clerk.openSignIn({ appearance, forceRedirectUrl: location.origin + location.pathname, signUpForceRedirectUrl: location.origin + location.pathname });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
