import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GridCell } from '../../src/components/Grid';
import { PersonRow } from '../../src/components/PersonRow';
import { Divider, Empty, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { fetchStats, fetchUserPosts, listNewFollowers } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, count, dayLabel, dayLabelISO, errText, fmt } from '../../src/lib/theme';
import type { Post, Profile, Stats, StatsDay } from '../../src/lib/types';

type Kind = 'views' | 'followers' | 'content';
const TITLES: Record<Kind, string> = { views: 'Views', followers: 'Followers', content: 'Content you shared' };
const RANGES = [7, 30, 90];

function Bars({ days, pick, what }: { days: StatsDay[]; pick: (d: StatsDay) => number; what: string }) {
  const values = days.map(pick);
  const max = Math.max(1, ...values);
  const best = values.indexOf(Math.max(...values));
  const summary = values.some((v) => v > 0) ? `${what} by day. The most was ${values[best]} on ${dayLabelISO(days[best].d)}.` : `${what} by day. None in this period.`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: days.length > 45 ? 1 : 2 }}>
        {values.map((v, i) => (
          <View key={days[i].d} style={{ flex: 1, height: v ? Math.max(4, Math.round((v / max) * 116)) : 2, borderRadius: 2, backgroundColor: v ? C.accent : C.surface2 }} />
        ))}
      </View>
      {days.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6 }}>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>{dayLabelISO(days[0].d)}</Text>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>Most in a day: {fmt(max === 1 && !values.some((v) => v > 0) ? 0 : max)}</Text>
          <Text style={{ color: C.fg3, fontSize: 12.5 }}>{dayLabelISO(days[days.length - 1].d)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 44 }}>
      <Text style={{ flex: 1, color: C.fg, fontSize: 17 }}>{label}</Text>
      <Text style={{ color: C.fg, fontSize: 17, fontVariant: ['tabular-nums'] }}>{fmt(value)}</Text>
    </View>
  );
}

export default function Insights() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = params.kind === 'followers' || params.kind === 'content' ? params.kind : 'views';
  const { me } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - 4) / 3);
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');

  const asked = useRef(0);
  const load = useCallback(async () => {
    // Only the newest request may fill the screen: tapping 90 days then 7 days must end on 7 days.
    const mine = ++asked.current;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400e3);
    setError('');
    setStats(null);
    try {
      const s = await fetchStats(from, to);
      if (mine !== asked.current) return;
      setStats(s);
      if (kind === 'followers') {
        const list = await listNewFollowers(me, from);
        if (mine === asked.current) setPeople(list);
      }
      if (kind === 'content') {
        const list = (await fetchUserPosts(me)).filter((p) => new Date(p.created_at).getTime() >= from.getTime());
        if (mine === asked.current) setPosts(list);
      }
    } catch (e) {
      if (mine === asked.current) setError(errText(e));
    }
  }, [days, kind, me]);

  useEffect(() => {
    load();
  }, [load]);

  const headline = !stats ? 0 : kind === 'views' ? stats.views : kind === 'followers' ? stats.new_followers : stats.posts + stats.reels + stats.stories;
  const caption = kind === 'views' ? 'views' : kind === 'followers' ? (headline === 1 ? 'new follower' : 'new followers') : headline === 1 ? 'thing shared' : 'things shared';

  return (
    <Screen>
      <ScreenHeader title={TITLES[kind]} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4 }} accessibilityRole="tablist">
          {RANGES.map((r) => (
            <Pressable key={r} onPress={() => setDays(r)} accessibilityRole="tab" accessibilityState={{ selected: days === r }} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: days === r ? C.fg : C.surface2 }}>
              <Text style={{ color: days === r ? C.bg : C.fg, fontWeight: '600' }}>Last {r} days</Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : !stats ? (
          <Loading />
        ) : (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6 }}>
              <Text style={{ color: C.fg, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmt(headline)}</Text>
              <Text style={{ color: C.fg2, fontSize: 16 }}>{caption} in the last {days} days</Text>
            </View>

            {kind === 'views' ? (
              <>
                <Bars days={stats.days} pick={(d) => d.views} what="Views" />
                <View style={{ height: 10 }} />
                <Divider thin />
                <SectionLabel strong>Where they came from</SectionLabel>
                <Line label="Posts and shorts" value={stats.post_views} />
                <Line label="Stories" value={stats.story_views} />
                <Line label="Different people who saw you" value={stats.accounts} />
                <Divider thin />
                <SectionLabel strong>Most viewed</SectionLabel>
                {stats.top.filter((t) => t.views > 0).length === 0 ? (
                  <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>When other people see your posts and shorts, the most viewed ones are listed here. Your own views are not counted.</Text>
                ) : (
                  stats.top
                    .filter((t) => t.views > 0)
                    .map((t) => {
                      const thumb = t.media ? (t.media.type === 'video' ? t.media.poster : t.media.url) : undefined;
                      return (
                        <Pressable key={t.id} onPress={() => router.push(t.kind === 'reel' ? `/watch/${t.id}` : `/post/${t.id}`)} accessibilityRole="button" accessibilityLabel={`${t.kind === 'reel' ? 'Short' : 'Post'} with ${t.views} views`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
                          <Image source={thumb ? { uri: thumb } : undefined} style={{ width: 54, height: 72, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: C.fg, fontSize: 17, fontWeight: '600' }}>{count(t.views, 'view')}</Text>
                            <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 2 }}>{count(t.likes, 'like')} · {count(t.comments, 'comment')} · {dayLabel(new Date(t.created_at))}</Text>
                          </View>
                        </Pressable>
                      );
                    })
                )}
              </>
            ) : null}

            {kind === 'followers' ? (
              <>
                <Bars days={stats.days} pick={(d) => d.followers} what="New followers" />
                <View style={{ height: 10 }} />
                <Divider thin />
                <Line label="Followers in total" value={stats.followers} />
                <Divider thin />
                <SectionLabel strong>New followers</SectionLabel>
                {people.length ? people.map((p) => <PersonRow key={p.id} person={p} />) : <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>Nobody new followed you in this period.</Text>}
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
                {posts.length ? (
                  <>
                    <Divider thin />
                    <SectionLabel strong>Posts and shorts from this period</SectionLabel>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                      {posts.map((p) => (
                        <GridCell key={p.id} post={p} size={cell} />
                      ))}
                    </View>
                  </>
                ) : (
                  <Empty title="Nothing shared in this period" body="Posts and shorts you share will be shown here." />
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
