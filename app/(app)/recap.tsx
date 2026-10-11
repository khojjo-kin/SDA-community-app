import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchStats } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { C, count, errText, fmt, monthName } from '../../src/lib/theme';
import type { Stats } from '../../src/lib/types';

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ width: '48%', padding: 14, borderRadius: 14, backgroundColor: C.surface }} accessible accessibilityLabel={`${label}: ${fmt(value)}`}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: C.fg, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmt(value)}</Text>
      <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

type Month = { key: string; from: Date; to: Date; label: string };

/** A look back at one calendar month. Opens on last month. */
export default function Recap() {
  const router = useRouter();
  // The six most recent full months, newest first.
  const months = useMemo<Month[]>(() => {
    const now = new Date();
    return [1, 2, 3, 4, 5, 6].map((back) => {
      const from = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
      return { key: `${from.getFullYear()}-${from.getMonth()}`, from, to, label: monthName(from) };
    });
  }, []);
  const [at, setAt] = useState(0);
  // The month on screen and its numbers. While another month loads, this one stays (dimmed), so the page doesn't jump.
  const [shown, setShown] = useState<{ month: Month; stats: Stats } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const month = months[at];
  const lastPush = useRef(0);

  // Only the newest request may fill the screen: tapping through the months must end on the last one tapped.
  const asked = useRef(0);
  const load = useCallback(() => {
    const mine = ++asked.current;
    setLoading(true);
    setError('');
    fetchStats(month.from, month.to)
      .then((s) => {
        if (mine === asked.current) setShown({ month, stats: { ...s, top: s.top ?? [] } });
      })
      .catch((e) => {
        if (mine === asked.current) setError(errText(e));
      })
      .finally(() => {
        if (mine === asked.current) setLoading(false);
      });
  }, [month]);
  useEffect(() => { load(); }, [load]);
  // Nothing more is drawn once the screen has gone.
  useEffect(() => () => { asked.current++; }, []);

  const stats = shown?.stats ?? null;
  const top = stats?.top.find((x) => x.views > 0);
  const topThumb = top?.media ? (top.media.type === 'video' ? top.media.poster : top.media.url) : undefined;
  const quiet = stats && stats.views + stats.likes + stats.comments + stats.new_followers + stats.posts + stats.reels + stats.stories === 0;
  // The card says which month its numbers are for: the one on screen, which may not yet be the one just tapped.
  const cardMonth = shown?.month ?? month;

  function openTop() {
    if (!top || Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    router.push(top.kind === 'reel' ? `/watch/${top.id}` : `/post/${top.id}`);
  }

  return (
    <Screen>
      <ScreenHeader title="Monthly recap" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 4 }} accessibilityRole="tablist">
          {months.map((m, i) => (
            <Pressable
              key={m.key}
              onPress={() => {
                if (i === at) return;
                tap('select');
                setAt(i);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: at === i }}
              style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: at === i ? C.fg : C.surface2, opacity: pressed && at !== i ? 0.7 : 1 })}>
              <Text style={{ color: at === i ? C.bg : C.fg, fontWeight: '600' }}>{m.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ opacity: loading && stats ? 0.45 : 1 }} accessibilityState={{ busy: loading }}>
          {/* The month as a headline on the page itself: the year in green, the month large, one line under it. */}
          <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 }}>
            <Text style={{ color: C.accent2, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{cardMonth.from.getFullYear()}</Text>
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 30, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 }}>Your {cardMonth.label}</Text>
            <Text style={{ color: C.fg2, fontSize: 15.5, lineHeight: 21, marginTop: 6 }}>{!stats ? 'Adding it up…' : quiet ? 'A quiet month. Nothing was shared and nobody new came by.' : `${fmt(stats.views)} ${stats.views === 1 ? 'view' : 'views'} from ${fmt(stats.accounts)} ${stats.accounts === 1 ? 'person' : 'people'}, and ${fmt(stats.new_followers)} new ${stats.new_followers === 1 ? 'follower' : 'followers'}.`}</Text>
          </View>

          {error ? (
            <ErrorNote message={error} onRetry={load} />
          ) : !stats ? (
            <Loading />
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, paddingHorizontal: 16 }}>
                <Tile label="Views" value={stats.views} />
                <Tile label="People reached" value={stats.accounts} />
                <Tile label="Likes" value={stats.likes} />
                <Tile label="Comments" value={stats.comments} />
                <Tile label="New followers" value={stats.new_followers} />
                <Tile label="Posts, shorts and stories shared" value={stats.posts + stats.reels + stats.stories} />
              </View>
              {top ? (
                <Pressable onPress={openTop} accessibilityRole="button" accessibilityLabel="Open your most viewed post of the month" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, padding: 12, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
                  <Image source={topThumb ? { uri: topThumb } : undefined} style={{ width: 62, height: 82, borderRadius: 10, backgroundColor: C.surface2 }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '700' }}>MOST VIEWED</Text>
                    <Text style={{ color: C.fg, fontSize: 18, fontWeight: '700', marginTop: 2 }}>{count(top.views, 'view')}</Text>
                    <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 1 }}>{count(top.likes, 'like')} · {count(top.comments, 'comment')}</Text>
                  </View>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
