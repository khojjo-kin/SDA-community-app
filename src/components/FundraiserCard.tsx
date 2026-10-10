import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchFundraiser } from '../lib/api';
import { money } from '../lib/payments';
import { listen } from '../lib/store';
import { C } from '../lib/theme';
import type { Fundraiser } from '../lib/types';
import { Icon } from './Icon';

/** How far along a fundraiser is, from 0 to 1. A goal of nothing counts as not started. */
export function progressOf(f: Pick<Fundraiser, 'raised_pence' | 'goal_pence'>): number {
  return f.goal_pence > 0 ? Math.min(1, Math.max(0, f.raised_pence / f.goal_pence)) : 0;
}

/**
 * Pence from an amount typed in pounds ("25", "£12.50", "1,250"). Null when it is not an amount.
 * Many phones' decimal keypads have a comma for the point, so a comma with at most two digits after
 * it at the end is the decimal mark: "12,50" is £12.50 and "5,5" is £5.50. Otherwise commas split
 * thousands ("1,000" is one thousand), and so may points before a decimal comma ("1.000,50").
 * "1.000" on its own could mean £1 or £1,000, so it is refused rather than guessed.
 */
export function penceFrom(text: string): number | null {
  const m = /^(.*?)(?:([.,])(\d{0,2}))?$/.exec(text.replace(/[£\s]/g, ''));
  if (!m) return null;
  const [, whole, mark, decimals = ''] = m;
  const grouped = mark === ',' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
  if (!/^\d+$/.test(whole) && !grouped.test(whole)) return null;
  // Whole pence, counted without floating point.
  return Number(whole.replace(/[.,]/g, '')) * 100 + Number(decimals.padEnd(2, '0'));
}

/** True once a fundraiser has been ended by its owner or its end date has passed. */
export function hasEnded(f: Pick<Fundraiser, 'status' | 'ends_at'>): boolean {
  return f.status === 'closed' || (!!f.ends_at && new Date(f.ends_at) <= new Date());
}

/** A thin bar in the accent colour. Any gift shows at least a sliver, so a first £5 is visible. */
export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const pct = value > 0 ? Math.max(2, Math.round(value * 100)) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }} style={{ height, borderRadius: height / 2, backgroundColor: C.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: C.accent }} />
    </View>
  );
}

/**
 * The fundraiser a member is running, shown on their profile under the bio. Tapping it opens the
 * fundraiser. Shows nothing while loading, or once it has ended or gone.
 */
export function FundraiserCard({ fundraiserId }: { fundraiserId: string }) {
  const router = useRouter();
  const [f, setF] = useState<Fundraiser | null>(null);

  useEffect(() => {
    let live = true;
    setF(null);
    const load = () => {
      fetchFundraiser(fundraiserId)
        .then((r) => { if (live) setF(r); })
        // The card is extra on a profile: if it cannot load, the profile simply goes without it.
        .catch(() => {});
    };
    load();
    // A gift or an edit announces 'profile': keep the total up to date.
    const off = listen('profile', load);
    return () => {
      live = false;
      off();
    };
  }, [fundraiserId]);

  if (!f || hasEnded(f)) return null;
  const raised = money(f.raised_pence, f.currency);
  const goal = money(f.goal_pence, f.currency);
  return (
    <Pressable
      onPress={() => router.push(`/fundraiser/${f.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Fundraiser: ${f.title}. ${raised} raised of ${goal}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="gift" size={22} color={C.accent2} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15, fontWeight: '700' }}>{f.title}</Text>
        <ProgressBar value={progressOf(f)} height={4} />
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13, fontVariant: ['tabular-nums'] }}>
          <Text style={{ color: C.fg, fontWeight: '600' }}>{raised}</Text> raised of {goal}
        </Text>
      </View>
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
}
