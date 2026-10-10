import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { fetchStats } from '../../src/lib/api';
import { C, count, errText, fmt, monthName } from '../../src/lib/theme';
import type { Stats } from '../../src/lib/types';

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ width: '48%', padding: 14, borderRadius: 14, backgroundColor: C.surface }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={{ color: C.fg, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmt(value)}</Text>
      <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** A look back at one calendar month. Opens on last month. */
export default function Recap() {
  const router = useRouter();
  // The six most recent full months, newest first.
  const months = useMemo(() => {
    const now = new Date();
    return [1, 2, 3, 4, 5, 6].map((back) => {
      const from = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
      return { key: `${from.getFullYear()}-${from.getMonth()}`, from, to, label: monthName(from) };
    });
  }, []);
  const [at, setAt] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const month = months[at];

  const load = () => {
    let live = true;
    setStats(null);
    setError('');
    fetchStats(month.from, month.to)
      .then((s) => { if (live) setStats(s); })
      .catch((e) => { if (live) setError(errText(e)); });
    return () => {
      live = false;
    };
  };
  useEffect(load, [month.key]);

  const top = stats?.top.find((t) => t.views > 0);
  const topThumb = top?.media ? (top.media.type === 'video' ? top.media.poster : top.media.url) : undefined;
  const quiet = stats && stats.views + stats.likes + stats.comments + stats.new_followers + stats.posts + stats.reels + stats.stories === 0;

  return (
    <Screen>
      <ScreenHeader title="Monthly recap" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 4 }} accessibilityRole="tablist">
          {months.map((m, i) => (
            <Pressable key={m.key} onPress={() => setAt(i)} accessibilityRole="tab" accessibilityState={{ selected: at === i }} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: at === i ? C.fg : C.surface2 }}>
              <Text style={{ color: at === i ? C.bg : C.fg, fontWeight: '600' }}>{m.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <LinearGradient colors={['#4a5df6', '#b13df0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ margin: 16, padding: 20, borderRadius: 18 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' }}>{month.from.getFullYear()}</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 2 }}>Your {month.label}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15.5, lineHeight: 21, marginTop: 6 }}>{!stats ? 'Adding it up…' : quiet ? 'A quiet month. Nothing was shared and nobody new came by.' : `${fmt(stats.views)} ${stats.views === 1 ? 'view' : 'views'} from ${fmt(stats.accounts)} ${stats.accounts === 1 ? 'person' : 'people'}, and ${fmt(stats.new_followers)} new ${stats.new_followers === 1 ? 'follower' : 'followers'}.`}</Text>
        </LinearGradient>

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
              <Tile label="Posts, clips and stories shared" value={stats.posts + stats.reels + stats.stories} />
            </View>
            {top ? (
              <Pressable onPress={() => router.push(top.kind === 'reel' ? `/watch/${top.id}` : `/post/${top.id}`)} accessibilityRole="button" accessibilityLabel="Open your most viewed post of the month" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, padding: 12, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
                <Image source={topThumb ? { uri: topThumb } : undefined} style={{ width: 62, height: 82, borderRadius: 10, backgroundColor: C.surface2 }} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '700' }}>MOST VIEWED</Text>
                  <Text style={{ color: C.fg, fontSize: 18, fontWeight: '700', marginTop: 2 }}>{count(top.views, 'view')}</Text>
                  <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 1 }}>{count(top.likes, 'like')} · {count(top.comments, 'comment')}</Text>
                </View>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
