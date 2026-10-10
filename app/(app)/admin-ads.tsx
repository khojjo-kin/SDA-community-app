import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame } from '../../src/components/AdminFrame';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { adminEndBoost, fetchAllFundraisers, fetchAllPromotions } from '../../src/lib/api';
import { money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { C, count, dayLabel, errText } from '../../src/lib/theme';
import type { Fundraiser, Promotion } from '../../src/lib/types';

type Person = { id: string; username: string; full_name: string; avatar_url: string };
type Tone = 'ok' | 'warn' | 'muted';

/**
 * Where an ad stands. Ending an ad early clears the post's boost but leaves the promotion row as it
 * was paid for ('active' until its end date), so the post's own boost decides whether it is still showing.
 */
function adState(a: Promotion): { label: string; tone: Tone; running: boolean } {
  switch (a.status) {
    case 'active': {
      if (a.ends_at && new Date(a.ends_at).getTime() <= Date.now()) return { label: 'Finished', tone: 'muted', running: false };
      if (!a.post) return { label: 'Post deleted', tone: 'muted', running: false };
      if (!a.post.boosted) return { label: 'Ended early', tone: 'muted', running: false };
      return { label: 'Running', tone: 'ok', running: true };
    }
    case 'ended':
      return { label: 'Ended', tone: 'muted', running: false };
    case 'failed':
      return { label: 'Payment failed', tone: 'warn', running: false };
    case 'refunded':
      return { label: 'Refunded', tone: 'warn', running: false };
    default:
      return { label: 'Not paid yet', tone: 'muted', running: false };
  }
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  const color = tone === 'ok' ? C.accent2 : tone === 'warn' ? C.like : C.fg2;
  const bg = tone === 'ok' ? C.accentSoft : tone === 'warn' ? C.like + '24' : C.surface2;
  return (
    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: bg, justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** A small square picture: the post's first photo (or a video's poster), or an icon when there is none. */
function Thumb({ uri, icon }: { uri?: string | null; icon: 'image' | 'gift' }) {
  if (uri) return <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: C.surface2 }} contentFit="cover" />;
  return (
    <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={24} color={C.fg2} />
    </View>
  );
}

/** Admins: every paid ad and every fundraiser, with a way to stop an ad early. */
export default function AdminAds() {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [seg, setSeg] = useState<'ads' | 'fundraisers'>('ads');
  const [ads, setAds] = useState<Promotion[] | null>(null);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [funds, setFunds] = useState<Fundraiser[] | null>(null);
  const [adsError, setAdsError] = useState('');
  const [fundsError, setFundsError] = useState('');
  const [ending, setEnding] = useState('');
  const admin = !!profile?.admin_role;

  const load = useCallback(() => {
    if (!admin) return;
    setAdsError('');
    setFundsError('');
    fetchAllPromotions()
      .then(async (rows) => {
        setAds(rows);
        // The post carries its author, but a deleted post does not: look those members up directly.
        const missing = [...new Set(rows.filter((r) => !r.post).map((r) => r.user_id))];
        if (!missing.length) return;
        const res = await supabase.from('community_profile_cards').select('id,username,full_name,avatar_url').in('id', missing);
        const found: Record<string, Person> = {};
        for (const p of (res.data ?? []) as Person[]) found[p.id] = p;
        setPeople(found);
      })
      .catch((e) => setAdsError(errText(e)));
    fetchAllFundraisers().then(setFunds).catch((e) => setFundsError(errText(e)));
  }, [admin]);
  useFocusEffect(load);

  // Running ads first (those are the ones an admin may need to act on), newest first within each group.
  const adRows = useMemo(() => {
    const rows = (ads ?? []).map((a) => ({ ad: a, state: adState(a) }));
    return rows.sort((x, y) => Number(y.state.running) - Number(x.state.running));
  }, [ads]);
  const running = adRows.filter((r) => r.state.running).length;
  const activeFunds = (funds ?? []).filter((f) => f.status === 'active').length;

  function endNow(a: Promotion) {
    if (!a.post_id || ending) return;
    const postId = a.post_id;
    Alert.alert('End this ad now?', 'The post stops showing as sponsored straight away. No money is refunded automatically.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End now',
        style: 'destructive',
        onPress: async () => {
          setEnding(a.id);
          try {
            await adminEndBoost(postId);
            setAds((list) => (list ?? []).map((x) => (x.post_id === postId && x.post ? { ...x, post: { ...x.post, boosted: false, boosted_until: null } } : x)));
            toast('Ad ended');
          } catch (e) {
            toast(errText(e));
          } finally {
            setEnding('');
          }
        },
      },
    ]);
  }

  if (!admin) {
    return (
      <Screen>
        <ScreenHeader title="Ads and fundraisers" />
        <Empty icon="shield" title="Admins only" body="Ads and fundraisers are overseen by the admins." />
      </Screen>
    );
  }

  const tabs = (
    <View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {(['ads', 'fundraisers'] as const).map((k) => (
          <Pressable key={k} onPress={() => setSeg(k)} accessibilityRole="tab" accessibilityState={{ selected: seg === k }} style={({ pressed }) => ({ paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: seg === k ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: seg === k ? C.bg : C.fg, fontWeight: '600' }}>{k === 'ads' ? 'Ads' : 'Fundraisers'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 10, fontSize: 13.5 }}>
        {ads ? `${count(running, 'ad')} running` : 'Ads loading'} · {funds ? `${count(activeFunds, 'fundraiser')} open` : 'fundraisers loading'}
      </Text>
    </View>
  );

  return (
    <AdminFrame section="ads" title="Ads and fundraisers">
      {tabs}
      {seg === 'ads' ? (
        ads === null ? (
          adsError ? <ErrorNote message={adsError} onRetry={load} /> : <Loading />
        ) : (
          <FlatList
            data={adRows}
            keyExtractor={(r) => r.ad.id}
            extraData={[ending, people]}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={<Empty icon="megaphone" title="No ads yet" body="When a member pays to promote a post, it appears here." />}
            renderItem={({ item: { ad: a, state } }) => {
              const post = a.post ?? null;
              const who = post ? { username: post.username, full_name: post.full_name, avatar_url: post.avatar_url } : people[a.user_id];
              const media = post?.media?.[0];
              const end = a.ends_at ? new Date(a.ends_at) : null;
              const when = end ? (state.running ? `Ends ${dayLabel(end)}` : `Ended ${dayLabel(end)}`) : `Paid ${dayLabel(new Date(a.created_at))}`;
              return (
                <View style={{ marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 16, backgroundColor: C.surface, gap: 10 }}>
                  <Pressable onPress={post ? () => router.push(`/post/${post.id}`) : undefined} accessibilityRole={post ? 'button' : undefined} accessibilityLabel={post ? `Open the post by ${who?.username ?? 'a member'}` : 'The post was deleted'} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, opacity: pressed ? 0.75 : 1 })}>
                    <Thumb uri={media ? media.poster ?? (media.type === 'image' ? media.url : null) : null} icon="image" />
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Avatar uri={who?.avatar_url} name={who?.full_name ?? '?'} size={20} />
                        <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontWeight: '700' }}>{who ? `@${who.username}` : 'A member'}</Text>
                        <Pill label={state.label} tone={state.tone} />
                      </View>
                      <Text style={{ color: C.fg, fontSize: 14 }}>
                        {count(a.days, 'day')} · {money(a.amount_pence, a.currency)}
                      </Text>
                      <Text style={{ color: C.fg2, fontSize: 13 }}>{when}</Text>
                    </View>
                  </Pressable>
                  {state.running ? <Button small kind="danger" label="End now" busy={ending === a.id} disabled={!!ending && ending !== a.id} onPress={() => endNow(a)} /> : null}
                </View>
              );
            }}
          />
        )
      ) : funds === null ? (
        fundsError ? <ErrorNote message={fundsError} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={funds}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Empty icon="gift" title="No fundraisers yet" body="When a member starts a fundraiser on their profile, it appears here." />}
          renderItem={({ item: f }) => {
            const share = f.goal_pence > 0 ? Math.min(1, f.raised_pence / f.goal_pence) : 0;
            const open = f.status === 'active';
            return (
              <Pressable onPress={() => router.push(`/fundraiser/${f.id}` as any)} accessibilityRole="button" accessibilityLabel={`${f.title} by ${f.username}, ${money(f.raised_pence, f.currency)} raised of ${money(f.goal_pence, f.currency)}, ${open ? 'open' : 'closed'}`} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 16, backgroundColor: C.surface, opacity: pressed ? 0.75 : 1 })}>
                <Thumb uri={f.cover_url || f.avatar_url || null} icon="gift" />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontWeight: '700' }}>{f.title}</Text>
                    <Pill label={open ? 'Open' : 'Closed'} tone={open ? 'ok' : 'muted'} />
                  </View>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>@{f.username}{f.accepting ? '' : ' · payouts not set up'}</Text>
                  <Text style={{ color: C.fg, fontSize: 14 }}>
                    {money(f.raised_pence, f.currency)} of {money(f.goal_pence, f.currency)} · {count(f.donor_count, 'supporter')}
                  </Text>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden', marginTop: 2 }}>
                    <View style={{ width: `${Math.round(share * 100)}%`, height: 5, backgroundColor: C.accent }} />
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </AdminFrame>
  );
}
