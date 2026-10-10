import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useAuth, useClerk, useSessionList } from '@clerk/clerk-expo';
import { forgetSeenStories } from './api';
import { cacheKey, clearCache, peekCache } from './cache';
import { forgetPayments } from './payments';
import { clearPosts } from './store';
import { supabase } from './supabase';
import type { Profile } from './types';

/*
 * Several accounts signed in on one phone, as on Instagram. Clerk keeps one session per account on
 * this phone's client (the instance has multi-session on); exactly one is in use at a time.
 *
 * Moving to another account is never a plain setActive: the app layout first closes every screen of
 * the account in use (useSwitching), so their channels, timers and requests end while its token is
 * still the one sent. Only then is the other session made active. Whatever the app keeps outside
 * screens for the account in use (the shared posts, stories seen, billing) is forgotten whenever
 * the account changes, however it changed (useAccountChangeReset), and the app opens again at Home.
 */

type Clerk = ReturnType<typeof useClerk>;
type ClerkSession = NonNullable<NonNullable<Clerk['client']>['sessions']>[number];

/** No more accounts than this on one phone. */
export const MAX_ACCOUNTS = 5;

export type Account = {
  sessionId: string;
  userId: string;
  /** Clerk's copy of the username (kept in step with the profile's), else the email before the @. */
  username: string;
  /** Clerk's picture, when the account has one of its own (Apple or Google). */
  imageUrl: string | null;
  current: boolean;
};

/** Who the app is moving to, for the cover shown meanwhile. */
export type SwitchTarget = { username: string; avatar: string | null };

/* ---------- state the layouts watch ---------- */

let switching: SwitchTarget | null = null;
let adding = false;
let running = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The account being moved to while a switch is under way, else null. The app layout shows a cover meanwhile. */
export function useSwitching(): SwitchTarget | null {
  return useSyncExternalStore(subscribe, () => switching, () => switching);
}

/** True while the sign-in pages are open to add another account, with the one in use still signed in. */
export function useAddingAccount(): boolean {
  return useSyncExternalStore(subscribe, () => adding, () => adding);
}

/** Set before opening the sign-in pages to add an account; the app layout clears it when it shows again. */
export function setAddingAccount(on: boolean) {
  if (adding === on) return;
  adding = on;
  emit();
}

/* ---------- the accounts on this phone ---------- */

function live(s: ClerkSession | null | undefined): s is ClerkSession & { user: NonNullable<ClerkSession['user']> } {
  return !!s && s.status === 'active' && !!s.user;
}

function describe(s: ClerkSession & { user: NonNullable<ClerkSession['user']> }, currentId: string | null | undefined): Account {
  const u = s.user;
  const email = u.primaryEmailAddress?.emailAddress ?? '';
  return {
    sessionId: s.id,
    userId: u.id,
    username: u.username || email.split('@')[0] || '',
    imageUrl: u.hasImage ? u.imageUrl : null,
    current: s.id === currentId,
  };
}

const recentFirst = (a: ClerkSession, b: ClerkSession) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();

/** Every account signed in on this phone, in a steady order. Updates whenever Clerk's sessions change. */
export function useAccounts(): Account[] {
  const { sessions } = useSessionList();
  const { sessionId } = useAuth();
  return useMemo(() => (sessions ?? []).filter(live).map((s) => describe(s, sessionId)), [sessions, sessionId]);
}

/* ---------- moving between them ---------- */

const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** The name and photo the app knows an account by: its profile as last kept on this phone, else Clerk's. */
function targetOf(clerk: Clerk, sessionId: string): SwitchTarget {
  const s = (clerk.client?.sessions ?? []).find((x) => x.id === sessionId);
  if (!live(s)) return { username: '', avatar: null };
  const a = describe(s, null);
  const p = peekCache<Profile>(cacheKey(a.userId, 'profile'));
  return { username: p?.username || a.username, avatar: p?.avatar_url || a.imageUrl };
}

/**
 * Makes another signed-in session the one in use. Every screen closes first and opens again at Home
 * as the new account; `after` runs before they do (logging the old account out, say). False when
 * another switch was already under way, so nothing happened.
 */
export async function switchAccount(clerk: Clerk, sessionId: string, opts: { to?: SwitchTarget; after?: () => Promise<unknown> } = {}): Promise<boolean> {
  if (running) return false;
  running = true;
  switching = opts.to ?? targetOf(clerk, sessionId);
  emit();
  try {
    // The app layout swaps every screen for the cover: let that land, so their clean-up runs now.
    await settle();
    // Any channel a screen left behind goes too. Not waited for: leaving needs the server's answer.
    for (const ch of supabase.getChannels()) supabase.removeChannel(ch).catch(() => {});
    await clerk.setActive({ session: sessionId });
    // Realtime keeps the token it last had: hand it the new account's before any screen subscribes.
    await supabase.realtime.setAuth().catch(() => {});
    await opts.after?.();
    return true;
  } finally {
    running = false;
    switching = null;
    emit();
  }
}

/**
 * Logs only the account in use out of this phone. Another account signed in here takes its place
 * (the app opens again at Home as that one); with none left, this is an ordinary log-out.
 */
export async function logOutCurrent(clerk: Clerk): Promise<void> {
  const current = clerk.session ?? null;
  const userId = current?.user?.id ?? '';
  const next = (clerk.client?.sessions ?? []).filter(live).filter((s) => s.id !== current?.id).sort(recentFirst)[0];
  if (!next) {
    // Clears this account's copies on the phone too (SessionProvider, once nobody is signed in).
    await clerk.signOut();
    return;
  }
  // Already gone (its sign-in account deleted, say): just pick up the next one.
  if (!current) {
    await clerk.setActive({ session: next.id });
    return;
  }
  // The other account first: removing the one in use first would leave nobody signed in for a moment.
  const done = await switchAccount(clerk, next.id, { after: () => current.remove() });
  if (done && userId) clearCache(userId);
}

/** logOutCurrent, for a screen. */
export function useLogOut(): () => Promise<void> {
  const clerk = useClerk();
  return useCallback(() => logOutCurrent(clerk), [clerk]);
}

/** Logs another account (not the one in use) out of this phone, and forgets its copies here. */
export async function removeAccount(clerk: Clerk, sessionId: string): Promise<void> {
  if (clerk.session?.id === sessionId) return logOutCurrent(clerk);
  const s = (clerk.client?.sessions ?? []).find((x) => x.id === sessionId);
  if (!s) return;
  const userId = s.user?.id ?? '';
  await s.remove();
  if (userId) clearCache(userId);
}

/* ---------- what must not outlive an account ---------- */

/** What the app keeps in memory for the account in use, outside any screen. */
function forgetMemberState() {
  clearPosts();
  forgetSeenStories();
  forgetPayments();
}

let lastUser: string | undefined;

/**
 * Forgets the account's in-memory state whenever the account in use changes, however it changed
 * (the switcher, adding an account, logging out of one), and gives Realtime the new token at once.
 * Clerk calls this right after the new session is set, before anything draws as the new account.
 */
function onClerkChange({ session }: { session?: { user?: { id: string } | null; lastActiveToken?: { getRawString: () => string } | null } | null }) {
  // Undefined while Clerk is between two states (logging out).
  if (session === undefined) return;
  const id = session?.user?.id ?? '';
  if (lastUser === undefined) {
    lastUser = id;
    return;
  }
  if (id === lastUser) return;
  lastUser = id;
  forgetMemberState();
  // The session's own last token is there straight away, so a channel opened at once already joins
  // as the new account; the token getter then hands Realtime a fresh one.
  const raw = session?.lastActiveToken?.getRawString() || null;
  if (raw) supabase.realtime.setAuth(raw).catch(() => {});
  supabase.realtime.setAuth().catch(() => {});
}

/** Mounted once, near the root (SessionProvider). */
export function useAccountChangeReset() {
  const clerk = useClerk();
  useEffect(() => clerk.addListener(onClerkChange), [clerk]);
}

/**
 * On the sign-in pages: signed out while other accounts are still signed in on this phone (the one in
 * use ended elsewhere, say), so the most recent of them is picked up rather than asking to log in.
 */
export function useResumeAccount(enabled: boolean) {
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const { sessions } = useSessionList();
  // Each session is tried once: one Clerk turns down is not asked again.
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !isLoaded || isSignedIn || running) return;
    const next = (sessions ?? []).filter(live).filter((s) => !tried.current.has(s.id)).sort(recentFirst)[0];
    if (!next) return;
    tried.current.add(next.id);
    clerk.setActive({ session: next.id }).catch(() => {});
  }, [enabled, isLoaded, isSignedIn, sessions, clerk]);
}

/* ---------- when switching has to wait ---------- */

const LIVE_ROUTES = new Set(['go-live', 'live/[id]']);

/** The navigation state's shape, as far as it is read here. */
type NavState = { routes?: readonly { name: string; state?: unknown }[] };

/** True while a live broadcast is open anywhere in the app's screens (broadcasting or watching). */
export function liveOpen(state: NavState | undefined): boolean {
  for (const r of state?.routes ?? []) {
    if (LIVE_ROUTES.has(r.name)) return true;
    if (r.state && liveOpen(r.state as NavState)) return true;
  }
  return false;
}
