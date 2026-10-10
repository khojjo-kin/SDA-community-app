import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '../../../src/components/Icon';
import { PaySheet } from '../../../src/components/PaySheet';
import { Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel, useToast } from '../../../src/components/ui';
import { fetchPost, promotePost } from '../../../src/lib/api';
import { ensureStripe, money } from '../../../src/lib/payments';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { C, dayLabel, errText } from '../../../src/lib/theme';
import type { PaymentsConfig } from '../../../src/lib/types';

/** The lengths most people pick. The stepper covers anything else from 1 to 30. */
const CHOICES = [1, 3, 7, 14, 30];
const MIN_DAYS = 1;
const MAX_DAYS = 30;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Paying to promote one of your own posts: it is shown at the top of For you and Explore, labelled
 * Sponsored, for the days paid for. Opened from the post's ••• menu and from "Your ads".
 */
export default function Promote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id ?? '');
  const router = useRouter();
  const toast = useToast();
  const { me, profile } = useSession();
  const post = usePost(postId);
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [paying, setPaying] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setError('');
    setMissing(false);
    try {
      // Fresh: the price per day, and whether payments are on, can change without a new build.
      const [c, p] = await Promise.all([ensureStripe(true), fetchPost(postId)]);
      if (!alive.current) return;
      setConfig(c);
      if (!p) setMissing(true);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [postId]);
  useEffect(() => { load(); }, [load]);

  const step = (by: number) => setDays((d) => Math.min(MAX_DAYS, Math.max(MIN_DAYS, d + by)));

  function paid(_paymentIntentId: string, slow: boolean) {
    setPaying(false);
    toast(slow ? 'Payment received — it may take a minute to show' : 'Your post is being promoted');
    if (router.canGoBack()) router.back();
    else router.replace('/ads');
  }

  let body: React.ReactNode;
  if (error && !config) body = <ErrorNote message={error} onRetry={load} />;
  else if (missing) body = <Empty icon="megaphone" title="This post isn't available" body="It may have been deleted." />;
  else if (!config || !post) body = <Loading />;
  else if (post.user_id !== me) body = <Empty icon="megaphone" title="You can only promote your own posts" />;
  else if (!config.ready) {
    body = <Empty icon="card" title="Card payments aren't switched on yet" body="Promoting a post will be available as soon as they are. Nothing has been charged." />;
  } else {
    const total = days * config.ad_day_pence;
    const totalLabel = money(total, config.currency);
    const first = post.media[0];
    const thumb = first ? (first.type === 'video' ? first.poster || '' : first.url) : '';
    const until = post.boosted && post.boosted_until && new Date(post.boosted_until) > new Date() ? dayLabel(new Date(post.boosted_until)) : '';
    body = (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* The post being promoted, so there is no doubt which one. */}
        <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 6, padding: 12, borderRadius: 16, backgroundColor: C.surface }}>
          <View style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            {thumb ? <Image source={{ uri: thumb }} style={{ width: 72, height: 72 }} contentFit="cover" transition={120} accessibilityIgnoresInvertColors /> : <Icon name="image" size={26} color={C.fg2} />}
            {first?.type === 'video' ? (
              <View style={{ position: 'absolute', right: 4, top: 4 }}>
                <Icon name="play" size={14} color="#fff" />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text numberOfLines={3} style={{ color: post.caption ? C.fg : C.fg2, fontSize: 14.5, lineHeight: 20 }}>{post.caption || 'No caption'}</Text>
            {until ? <Text style={{ color: C.accent2, fontSize: 13, fontWeight: '600', marginTop: 4 }}>Promoted until {until}</Text> : null}
          </View>
        </View>

        <SectionLabel>How long</SectionLabel>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
          {CHOICES.map((n) => {
            const on = days === n;
            return (
              <Pressable
                key={n}
                onPress={() => setDays(n)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={plural(n, 'day')}
                style={({ pressed }) => ({ height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : pressed ? C.surface2 : C.surface })}>
                <Text style={{ color: on ? C.onAccent : C.fg, fontWeight: '600', fontSize: 14.5 }}>{plural(n, 'day')}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, padding: 6, borderRadius: 14, backgroundColor: C.surface }}>
          <Stepper icon="minus" label="One day fewer" disabled={days <= MIN_DAYS} onPress={() => step(-1)} />
          <Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center', color: C.fg, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{plural(days, 'day')}</Text>
          <Stepper icon="plus" label="One day more" disabled={days >= MAX_DAYS} onPress={() => step(1)} />
        </View>

        <View style={{ marginHorizontal: 16, marginTop: 18, padding: 16, borderRadius: 16, backgroundColor: C.surface, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>Total</Text>
            <Text style={{ color: C.fg, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{totalLabel}</Text>
          </View>
          <Text style={{ color: C.fg2, fontSize: 13.5 }}>{plural(days, 'day')} × {money(config.ad_day_pence, config.currency)} a day</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16 }}>
          <Icon name="megaphone" size={20} color={C.fg2} />
          <Text style={{ flex: 1, color: C.fg2, fontSize: 14, lineHeight: 20 }}>
            Your post is shown at the top of For you and Explore, labelled Sponsored, until the days run out. Runs straight after paying.
            {until ? ` It's already promoted until ${until}, so these days are added on after that.` : ''}
          </Text>
        </View>

        {/* A private account's posts are only shown to its followers, so the server refuses to promote them.
            Other refusals (a post in a private group, say) come back from the server and show in the pay sheet as they are. */}
        {profile?.is_private ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.warn + '1f' }}>
              <Icon name="lock" size={18} color={C.warn} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 14, lineHeight: 19 }}>
                Your account is private, so new people can't see your posts. Make it public in Edit profile to promote this post.
              </Text>
            </View>
            <Button label="Edit profile" onPress={() => router.push('/edit-profile')} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 10 }}>
            <Button label={`Pay ${totalLabel}`} onPress={() => setPaying(true)} />
            <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>A one-off payment. Nothing renews.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  const totalLabel = config ? money(days * config.ad_day_pence, config.currency) : '';
  return (
    <Screen>
      <ScreenHeader title="Promote post" />
      {body}
      {config?.ready ? (
        <PaySheet
          visible={paying}
          onClose={() => setPaying(false)}
          title={`Promote your post for ${plural(days, 'day')}`}
          amountLabel={totalLabel}
          walletLabel={`Community ad · ${plural(days, 'day')}`}
          wallet="buy"
          note="Your post is promoted as soon as the payment goes through."
          start={() => promotePost(postId, days)}
          onPaid={paid}
        />
      ) : null}
    </Screen>
  );
}

/** The − and + either side of the number of days. */
function Stepper({ icon, label, disabled, onPress }: { icon: 'minus' | 'plus'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({ width: 44, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed && !disabled ? C.surface2 : 'transparent', opacity: disabled ? 0.35 : 1 })}>
      {icon === 'plus' ? <Icon name="plus" size={20} color={C.fg} weight={2.2} /> : <View style={{ width: 14, height: 2.2, borderRadius: 1.1, backgroundColor: C.fg }} />}
    </Pressable>
  );
}
