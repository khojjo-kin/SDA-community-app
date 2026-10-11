import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppFont } from '../lib/fonts';
import { tap } from '../lib/haptics';
import { C, errText, fmt } from '../lib/theme';
import { Icon, IconName } from './Icon';
import { Skeleton, SkeletonFrame } from './Skeleton';
import { Screen, ScreenHeader, useToast } from './ui';

/** The admin console's sections, in sidebar order. Each opens its own screen. */
export const ADMIN_SECTIONS: { key: AdminSection; label: string; icon: IconName; href: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'chart', href: '/admin' },
  { key: 'members', label: 'Members', icon: 'people', href: '/admin-members' },
  { key: 'reports', label: 'Reports', icon: 'flag', href: '/admin-reports' },
  { key: 'requests', label: 'Requests', icon: 'verified', href: '/admin-requests' },
  { key: 'publishers', label: 'Publishers', icon: 'lesson', href: '/admin-publishers' },
  { key: 'ads', label: 'Ads and fundraisers', icon: 'megaphone', href: '/admin-ads' },
  { key: 'words', label: 'Offensive words', icon: 'gavel', href: '/admin-words' },
  { key: 'admins', label: 'Admins', icon: 'shield', href: '/admin-admins' },
  { key: 'transactions', label: 'Transactions', icon: 'receipt', href: '/admin-transactions' },
  { key: 'activity', label: 'Activity', icon: 'pulse', href: '/admin-activity' },
  { key: 'support', label: 'Support chats', icon: 'lifebuoy', href: '/admin-support' },
  { key: 'feedback', label: 'Feedback and reviews', icon: 'star', href: '/admin-feedback' },
  { key: 'pod', label: 'Pod', icon: 'headphones', href: '/pod' },
  { key: 'hymns', label: 'Hymns', icon: 'hymnal', href: '/hymnal' },
  { key: 'churches', label: 'Churches', icon: 'church', href: '/churches' },
  { key: 'groups', label: 'Groups', icon: 'users', href: '/groups' },
];

export type AdminSection = 'overview' | 'members' | 'reports' | 'requests' | 'publishers' | 'ads' | 'words' | 'admins' | 'transactions' | 'activity' | 'support' | 'feedback' | 'pod' | 'hymns' | 'churches' | 'groups';

/** From this width up (an iPad on its side, or a Mac window) the console shows its sidebar. */
export const WIDE_WIDTH = 860;
/** The sidebar's width, and the widest the content beside it grows. */
const SIDEBAR = 240;
const CONTENT_MAX = 880;

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_WIDTH;
}

/** "£12.34", or "12.34 USD" when the money is not in pounds. Negative amounts keep their sign. */
export function money(pence: number, currency = 'GBP'): string {
  const n = (Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = pence < 0 ? '-' : '';
  const code = (currency || 'GBP').toUpperCase();
  return code === 'GBP' ? `${sign}£${n}` : `${sign}${n} ${code}`;
}

/**
 * The frame around every admin console screen. On a phone it is the usual screen with a header.
 * On a wide screen it adds a sidebar on the left listing the console's sections, with the screen's
 * own content on the right, so the whole console can be worked from an iPad or a Mac.
 */
export function AdminFrame({ section, title, right, children }: { section: AdminSection; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  const wide = useWide();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const font = useAppFont();
  const fontBold = useAppFont('bold');

  if (!wide) {
    return (
      <Screen>
        <ScreenHeader title={title} right={right} />
        {children}
      </Screen>
    );
  }

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: SIDEBAR, backgroundColor: C.bg2, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.line }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 19, fontWeight: '800', fontFamily: fontBold }}>Admin console</Text>
            <Text style={{ color: C.fg3, fontSize: 12.5, fontFamily: font }}>Community</Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12, gap: 2 }} showsVerticalScrollIndicator={false}>
            {ADMIN_SECTIONS.map((s) => {
              const on = s.key === section;
              return (
                <Pressable
                  key={s.key}
                  onPress={on ? undefined : () => router.navigate(s.href as any)}
                  accessibilityRole="tab"
                  accessibilityLabel={s.label}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 12, borderRadius: 11, backgroundColor: on ? C.surface : pressed ? C.press : 'transparent' })}>
                  <Icon name={s.icon} size={21} color={on ? C.accent2 : C.fg2} weight={2} />
                  <Text numberOfLines={1} style={{ flex: 1, color: on ? C.fg : C.fg2, fontSize: 15.5, fontWeight: on ? '700' : '500', fontFamily: on ? fontBold : font }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Clear of the home indicator on an iPad. */}
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Back to the app" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 50 + insets.bottom, paddingBottom: insets.bottom, paddingHorizontal: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
            <Icon name="back" size={20} color={C.fg2} weight={2} />
            <Text style={{ color: C.fg2, fontSize: 15, fontFamily: font }}>Back to the app</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: CONTENT_MAX }}>
            <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 }}>
              <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 22, fontWeight: '800', fontFamily: fontBold }}>{title}</Text>
              {right}
            </View>
            {children}
          </View>
        </View>
      </View>
    </Screen>
  );
}

/* ---------- pieces the console's lists share ---------- */

/**
 * The row of filters at the top of a console list (Open / Everything, Ads / Fundraisers). It scrolls
 * sideways when the chips don't fit, and lets a swipe pass through when they do.
 */
export function Chips<K extends string>({ options, value, onChange }: { options: { key: K; label: string; count?: number }[]; value: K; onChange: (key: K) => void }) {
  return (
    <View>
      <ScrollView horizontal alwaysBounceHorizontal={false} showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={on ? undefined : () => { tap('select'); onChange(o.key); }}
              accessibilityRole="tab"
              accessibilityLabel={o.count ? `${o.label}, ${o.count}` : o.label}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: on ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Text numberOfLines={1} style={{ color: on ? C.bg : C.fg, fontSize: 14.5, fontWeight: '600' }}>
                {o.label}
                {o.count ? <Text style={{ color: on ? C.bg : C.fg2, fontWeight: '500' }}>{`  ${fmt(o.count)}`}</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Under a list while its next page is on its way. */
export function PageSpinner({ active }: { active: boolean }) {
  return active ? (
    <View style={{ paddingVertical: 18, alignItems: 'center' }}>
      <ActivityIndicator color={C.fg2} />
    </View>
  ) : null;
}

/**
 * Cards on their way (reports, requests, churches to approve): a face and a name, a few lines, the
 * buttons. Outlined rather than filled, so the blocks inside show on both themes.
 */
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  const { width: screen } = useWindowDimensions();
  const width = screen >= WIDE_WIDTH ? Math.min(screen - SIDEBAR, CONTENT_MAX) : screen;
  const inner = width - 32 - 28;
  return (
    <SkeletonFrame style={{ paddingTop: 2 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Skeleton width={44} height={44} radius={22} x={30} />
            <View style={{ gap: 7 }}>
              <Skeleton width={Math.round(inner * (i % 2 ? 0.36 : 0.44))} height={12} x={84} />
              <Skeleton width={Math.round(inner * (i % 2 ? 0.5 : 0.3))} height={10} x={84} />
            </View>
          </View>
          <Skeleton width={Math.round(inner * 0.9)} height={11} x={30} />
          <Skeleton width={Math.round(inner * (i % 2 ? 0.55 : 0.7))} height={11} x={30} />
          <Skeleton width={inner} height={32} radius={10} x={30} />
        </View>
      ))}
    </SkeletonFrame>
  );
}

/* ---------- a list read a page at a time ---------- */

export type PagedList<T> = {
  /** null until the first page has arrived. */
  items: T[] | null;
  /** For changes made on the screen (a report dismissed, a row removed), without fetching again. */
  setItems: React.Dispatch<React.SetStateAction<T[] | null>>;
  /** Why the first page didn't arrive; shown with a retry in place of the list. */
  error: string;
  /** The first page, or a fresh copy of it, is on its way. */
  fetching: boolean;
  refreshing: boolean;
  /** A fresh copy of a list already on screen is on its way (for SlowLine; the loading shapes cover the first load). */
  slow: boolean;
  /** The next page is on its way. */
  paging: boolean;
  /** For onEndReached. */
  more: () => void;
  /** For pull to refresh. */
  refresh: () => void;
  /** Starts again from the loading shapes, after an error. */
  retry: () => void;
  /** Fetches the first page again without any spinner, as when coming back to the screen (a live update). */
  reload: () => void;
};

type How = 'reset' | 'swap' | 'quiet' | 'pull';

/**
 * A console list read a page at a time. `fetchPage` gets the last item shown (null for the first
 * page) and must be memoised; when it changes, the list starts again: from the loading shapes (a
 * new tab), or with `swap` keeping the rows until the new ones arrive (a new search). Coming back to
 * the screen fetches the first page again quietly and keeps the pages already scrolled through, so
 * the list doesn't jump. Only the latest request may fill the list.
 */
export function usePagedList<T>(fetchPage: (last: T | null) => Promise<T[]>, { pageSize, keyOf, swap = false, enabled = true }: { pageSize: number; keyOf: (item: T) => string; swap?: boolean; enabled?: boolean }): PagedList<T> {
  const toast = useToast();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  const current = useRef<T[] | null>(null);
  current.current = items;
  const latest = useRef({ fetchPage, pageSize, keyOf });
  latest.current = { fetchPage, pageSize, keyOf };
  const gen = useRef(0);
  const done = useRef(false);
  const pagingNow = useRef(false);
  // The fetchPage the rows on screen came from. A fresh first page is merged into them, and a next
  // page asked for, only while it is still the one in use: not while a new search is on its way,
  // nor after one failed (the rows shown are then still the old search's).
  const owner = useRef<((last: T | null) => Promise<T[]>) | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    (how: How) => {
      const { fetchPage: get, pageSize: size, keyOf: key } = latest.current;
      const n = ++gen.current;
      pagingNow.current = false;
      setPaging(false);
      setFetching(true);
      if (how === 'reset') {
        setItems(null);
        setError('');
      }
      if (how === 'pull') setRefreshing(true);
      get(null)
        .then((page) => {
          if (!alive.current || n !== gen.current) return;
          setError('');
          const cur = current.current;
          // Coming back: keep the older pages already shown after the fresh first page, so nothing jumps.
          // They are taken from the list as it stands when the page lands, so a row the screen changed
          // in the meantime (not yet drawn) keeps its change. A pull happens at the top of the list,
          // so it starts again from the fresh page and nothing older stays stale.
          if (how === 'quiet' && cur && page.length >= size && owner.current === get) {
            const last = key(page[page.length - 1]);
            const at = cur.findIndex((x) => key(x) === last);
            if (at >= 0 && at < cur.length - 1) {
              const seen = new Set(page.map(key));
              setItems((list) => {
                const now = list ?? cur;
                const from = now.findIndex((x) => key(x) === last);
                return [...page, ...(from >= 0 ? now.slice(from + 1) : cur.slice(at + 1)).filter((x) => !seen.has(key(x)))];
              });
              return;
            }
          }
          done.current = page.length < size;
          owner.current = get;
          setItems(page);
        })
        .catch((e) => {
          if (!alive.current || n !== gen.current) return;
          if (how === 'reset' || current.current === null) setError(errText(e));
          // A refresh nobody asked for fails quietly; the rows on screen stay.
          else if (how !== 'quiet') toast(errText(e));
        })
        .finally(() => {
          if (!alive.current) return;
          if (how === 'pull') setRefreshing(false);
          if (n === gen.current) setFetching(false);
        });
    },
    [toast],
  );

  const more = useCallback(() => {
    const cur = current.current;
    const { fetchPage: get, pageSize: size, keyOf: key } = latest.current;
    if (!cur || !cur.length || done.current || pagingNow.current || owner.current !== get) return;
    const n = gen.current;
    pagingNow.current = true;
    setPaging(true);
    get(cur[cur.length - 1])
      .then((page) => {
        if (!alive.current || n !== gen.current) return;
        if (page.length < size) done.current = true;
        if (!page.length) return;
        setItems((list) => {
          if (!list) return list;
          const seen = new Set(list.map(key));
          return [...list, ...page.filter((x) => !seen.has(key(x)))];
        });
      })
      .catch((e) => {
        if (alive.current && n === gen.current) toast(errText(e));
      })
      .finally(() => {
        if (n !== gen.current) return;
        pagingNow.current = false;
        if (alive.current) setPaging(false);
      });
  }, [toast]);

  // The first visit loads from the loading shapes; a new fetchPage starts again; coming back refreshes quietly.
  const shown = useRef<((last: T | null) => Promise<T[]>) | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      if (shown.current === fetchPage) {
        load('quiet');
        return;
      }
      const how: How = shown.current === null || !swap ? 'reset' : 'swap';
      shown.current = fetchPage;
      load(how);
    }, [enabled, fetchPage, swap, load]),
  );

  const refresh = useCallback(() => load('pull'), [load]);
  const retry = useCallback(() => load('reset'), [load]);
  const reload = useCallback(() => {
    // Nothing to refresh before the first visit has started the list.
    if (shown.current) load('quiet');
  }, [load]);
  return { items, setItems, error, fetching, refreshing, slow: refreshing || (fetching && items !== null), paging, more, refresh, retry, reload };
}
