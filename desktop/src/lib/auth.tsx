// Sign-in. The real app uses the same Clerk application as the iPhone app (the publishable key in
// the repository's .env), loaded from Clerk at start-up, so the same email and password work on both.
// Every Supabase request carries the Clerk session token, exactly as on the iPhone.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CLERK_KEY, setTokenGetter } from 'shared/supabase';

declare const __DEMO__: boolean;

export type AuthUser = { id: string; email: string; name: string; imageUrl: string; username: string };

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
    s.onerror = () => reject(new Error('Could not reach the sign-in service. Check your internet connection.'));
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

const DEMO_USER: AuthUser = { id: 'demo_me', email: 'demo@example.com', name: 'Demo Account', imageUrl: '', username: 'you' };

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
          setError(e?.message || 'Sign-in could not start.');
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
      if (__DEMO__) setUser(null);
      else await window.Clerk.signOut({ redirectUrl: location.origin + location.pathname });
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
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
