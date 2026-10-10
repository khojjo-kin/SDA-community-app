import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GridCell, useOpenFromGrid } from '../../src/components/Grid';
import { PersonRow } from '../../src/components/PersonRow';
import { Divider, Empty, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { fetchStats, fetchUserPosts, listNewFollowers } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, count, dayLabel, dayLabelISO, errText, fmt } from '../../src/lib/theme';
import type { Post, Profile, Stats, StatsDay } from '../../src/lib/types';

type Kind = 'views' | 'followers' | 'content';
const TITLES: Record<Kind, string> = { views: 'Views', followers: 'Followers', content: 'Content you shared' };
const RANGES = [7, 30, 90];

/** One bar a day, in the accent colour; days with none show as a thin line. Memoised: it only changes with its numbers. */
const Bars = React.memo(function Bars({ days, pick, what }: { days: StatsDay[]; pick: 'views' | 'followers'; what: string }) {
  const values = days.map((d) => Number(d[pick]) || 0);
  const most = values.length ? Math.max(...values) : 0;
  const max = Math.max(1, most);
  const best = values.indexOf(most);
  const summary = most > 0 ? `${what} by day. The most was ${fmt(most)} on ${dayLabelISO(days[best].d)}.` : `${what} by day. None in this period.`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: days.length > 45 ? 1 : 2 }}>
        {values.map((v, i) => (
          <View key={days[i].d} style={{ flex: 1, height: v ? Math.max(4, Math.round((v / max) * 116)) : 2, borderRadius: 2, backgroundColor: v ? C.accent : C.surface2 }} />
        ))}
      </View>
      {days.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 6 }}>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>{dayLabelISO(days[0].d)}</Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg3, fontSize: 12.5 }}>Most in a day: {fmt(most)}</Text>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>{dayLabelISO(days[days.length - 1].d)}</Text>
        </View>
      ) : null}
    </View>
  );
});

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 44 }}>
      <Text style={{ flex: 1, color: C.fg, fontSize: 17 }}>{label}</Text>
      <Text style={{ color: C.fg, fontSize: 17, fontVariant: ['tabular-nums'] }}>{fmt(value)}</Text>
    </View>
  );
}

/** What is on screen, with the number of days it covers (the tab may already be on another while that loads). */
type Shown = { stats: Stats; days: number; people: Profile[]; posts: Post[] };

export default function Insights() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = params.kind === 'followers' || params.kind === 'content' ? params.kind : 'views';
  const { me } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - 4) / 3);
  const [days, setDays] = useState(30);
  const [shown, setShown] = useState<Shown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const openPost = useOpenFromGrid(shown?.posts ?? []);
  // One screen per tap, however quickly a post is tapped twice.
  const lastPush = useRef(0);
  const open = (href: string) => {
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    router.push(href);
  };

  const asked = useRef(0);
  const load = useCallback(async () => {
    // Only the newest request may fill the screen: tapping 90 days then 7 days must end on 7 days.
    const mine = ++asked.current;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400e3);
    setError('');
    setLoading(true);
    try {
      // What was there stays (dimmed) until the new period has all arrived, so the page doesn't jump.
      const [stats, people, posts] = await Promise.all([
        fetchStats(from, to),
        kind === 'followers' ? listNewFollowers(me, from) : Promise.resolve([] as Profile[]),
        kind === 'content' ? fetchUserPosts(me).then((list) => list.filter((p) => new Date(p.created_at).getTime() >= from.getTime())) : Promise.resolve([] as Post[]),
      ]);
      if (mine !== asked.current) return;
      setShown({ stats: { ...stats, days: stats.days ?? [], top: stats.top ?? [] }, days, people, posts });
    } catch (e) {
      if (mine === asked.current) setError(errText(e));
    } finally {
      if (mine === asked.current) setLoading(false);
    }
  }, [days, kind, me]);

  useEffect(() => {
    load();
  }, [load]);
  // Nothing more is drawn once the screen has gone.
  useEffect(() => () => { asked.current++; }, []);

  const stats = shown?.stats ?? null;
  const headline = !stats ? 0 : kind === 'views' ? stats.views : kind === 'followers' ? stats.new_followers : stats.posts + stats.reels + stats.stories;
  const caption = kind === 'views' ? 'views' : kind === 'followers' ? (headline === 1 ? 'new follower' : 'new followers') : headline === 1 ? 'thing shared' : 'things shared';
  const viewed = stats ? stats.top.filter((x) => x.views > 0) : [];

  return (
    <Screen>
      <ScreenHeader title={TITLES[kind]} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4 }} accessibilityRole="tablist">
          {RANGES.map((r) => (
            <Pressable
              key={r}
              onPress={() => {
                if (r === days) return;
                tap('select');
                setDays(r);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: days === r }}
              style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: days === r ? C.fg : C.surface2, opacity: pressed && days !== r ? 0.7 : 1 })}>
              <Text style={{ color: days === r ? C.bg : C.fg, fontWeight: '600' }}>Last {r} days</Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : !stats || !shown ? (
          <Loading />
        ) : (
          <View style={{ opacity: loading ? 0.45 : 1 }} accessibilityState={{ busy: loading }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6 }}>
              <Text style={{ color: C.fg, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmt(headline)}</Text>
              <Text style={{ color: C.fg2, fontSize: 16 }}>{caption} in the last {shown.days} days</Text>
            </View>

            {kind === 'views' ? (
              <>
                <Bars days={stats.days} pick="views" what="Views" />
                <View style={{ height: 10 }} />
                <Divider thin />
                <SectionLabel strong>Where they came from</SectionLabel>
                <Line label="Posts and shorts" value={stats.post_views} />
                <Line label="Stories" value={stats.story_views} />
                <Line label="Different people who saw you" value={stats.accounts} />
                <Divider thin />
                <SectionLabel strong>Most viewed</SectionLabel>
                {viewed.length === 0 ? (
                  <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>No views yet.</Text>
                ) : (
                  viewed.map((x) => {
                    const thumb = x.media ? (x.media.type === 'video' ? x.media.poster : x.media.url) : undefined;
                    return (
                      <Pressable key={x.id} onPress={() => open(x.kind === 'reel' ? `/watch/${x.id}` : `/post/${x.id}`)} accessibilityRole="button" accessibilityLabel={`${x.kind === 'reel' ? 'Short' : 'Post'} with ${count(x.views, 'view')}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
                        <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 54, height: 72, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.fg, fontSize: 17, fontWeight: '600' }}>{count(x.views, 'view')}</Text>
                          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5, marginTop: 2 }}>{count(x.likes, 'like')} · {count(x.comments, 'comment')} · {dayLabel(new Date(x.created_at))}</Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </>
            ) : null}

            {kind === 'followers' ? (
              <>
                <Bars days={stats.days} pick="followers" what="New followers" />
                <View style={{ height: 10 }} />
                <Divider thin />
                <Line label="Followers in total" value={stats.followers} />
                <Divider thin />
                <SectionLabel strong>New followers</SectionLabel>
                {shown.people.length ? shown.people.map((p) => <PersonRow key={p.id} person={p} />) : <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>Nobody new followed you in this period.</Text>}
              </>
            ) : null}

            {kind === 'content' ? (
              <>
                <View style={{ height: 8 }} />
                <Divider thin />
                <SectionLabel strong>What you shared</SectionLabel>
                <Line label="Posts" value={stats.posts} />
                <Line label="Shorts" value={stats.reels} />
                <Line label="Stories" value={stats.stories} />
                <Divider thin />
                <SectionLabel strong>What it earned</SectionLabel>
                <Line label="Likes" value={stats.likes} />
                <Line label="Comments" value={stats.comments} />
                <Line label="Reposts" value={stats.reposts} />
                {shown.posts.length ? (
                  <>
                    <Divider thin />
                    <SectionLabel strong>Posts and shorts from this period</SectionLabel>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                      {shown.posts.map((p) => (
                        <GridCell key={p.id} post={p} size={cell} onOpen={openPost} />
                      ))}
                    </View>
                  </>
                ) : (
                  <Empty title="Nothing shared in this period" />
                )}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
