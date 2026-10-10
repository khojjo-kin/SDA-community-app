import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, Sheet } from '../../src/components/ui';
import { myPromotions } from '../../src/lib/api';
import { money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { Promotion } from '../../src/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Active · ends 14 Oct", "Ended" or "Refunded", from the row and the clock. */
function standing(p: Promotion): { label: string; live: boolean } {
  if (p.status === 'refunded') return { label: 'Refunded', live: false };
  const ends = p.ends_at ? new Date(p.ends_at) : null;
  // The row stays 'active' until the nightly tidy-up, so the end date decides.
  if (p.status === 'active' && ends && ends > new Date()) return { label: `Active · ends ${dayLabel(ends)}`, live: true };
  return { label: 'Ended', live: false };
}

/** The ads the member has paid for, newest first, with a quick way to run one again. */
export default function Ads() {
  const router = useRouter();
  const { me } = useSession();
  const [list, setList] = useState<Promotion[] | null>(null);
  const [error, setError] = useState('');
  const [how, setHow] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await myPromotions(me);
      // A declined card leaves a failed attempt behind; it was never an ad, so it is not listed.
      if (alive.current) setList(rows.filter((r) => r.status !== 'failed'));
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [me]);
  // Back from promoting a post again: show the new ad.
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => { alive.current = false; };
    }, [load]),
  );

  const header = (
    <Pressable onPress={() => setHow(true)} accessibilityRole="button" accessibilityLabel="Promote a post. How to start" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 6, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: pressed ? C.surface2 : C.surface })}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="megaphone" size={24} color={C.accent2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.fg, fontSize: 16, fontWeight: '700' }}>Promote a post</Text>
        <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18, marginTop: 2 }}>Start from the ••• menu on any of your posts.</Text>
      </View>
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );

  let body: React.ReactNode;
  if (error && !list) body = <ErrorNote message={error} onRetry={load} />;
  else if (!list) body = <Loading />;
  else
    body = (
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <Empty
            icon="megaphone"
            title="No ads yet"
            body="Promoting a post puts it at the top of For you and Explore, labelled Sponsored, for the days you choose. You pay once; nothing renews."
          />
        }
        renderItem={({ item }) => <AdRow item={item} onAgain={(postId) => router.push(`/promote/${postId}`)} />}
      />
    );

  return (
    <Screen>
      <ScreenHeader title="Your ads" />
      {body}
      <Sheet visible={how} onClose={() => setHow(false)} title="Promote a post">
        <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 14 }}>
          {[
            'Open one of your posts on your profile.',
            'Tap ••• in the top corner and choose Promote.',
            'Pick how many days, then pay. It starts straight away.',
          ].map((line, i) => (
            <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.fg, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, color: C.fg, fontSize: 15.5, lineHeight: 21 }}>{line}</Text>
            </View>
          ))}
          <Button
            label="Go to my profile"
            onPress={() => {
              setHow(false);
              router.push(`/user/${me}`);
            }}
            style={{ marginTop: 6 }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function AdRow({ item, onAgain }: { item: Promotion; onAgain: (postId: string) => void }) {
  const { label, live } = standing(item);
  const post = item.post ?? null;
  const first = post?.media[0];
  const thumb = first ? (first.type === 'video' ? first.poster || '' : first.url) : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
        {thumb ? <Image source={{ uri: thumb }} style={{ width: 56, height: 56 }} contentFit="cover" transition={120} accessibilityIgnoresInvertColors /> : <Icon name={post ? 'image' : 'trash'} size={22} color={C.fg3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: post ? C.fg : C.fg2, fontSize: 15, fontWeight: '600' }}>{post ? post.caption || 'Post' : 'Post deleted'}</Text>
        <Text style={{ color: live ? C.accent2 : C.fg2, fontSize: 13.5, marginTop: 2, fontWeight: live ? '600' : '400' }}>{label}</Text>
        <Text style={{ color: C.fg3, fontSize: 13, marginTop: 1, fontVariant: ['tabular-nums'] }}>
          {plural(item.days, 'day')} · {money(item.amount_pence, item.currency)}
        </Text>
      </View>
      {post && item.post_id ? <Button small kind="ghost" label="Promote again" onPress={() => onAgain(item.post_id!)} /> : null}
    </View>
  );
}
