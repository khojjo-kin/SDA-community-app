import React, { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { AdminFrame, CardsSkeleton, Chips, PageSpinner, usePagedList } from '../../src/components/AdminFrame';
import { Icon } from '../../src/components/Icon';
import { SlowLine } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, useToast } from '../../src/components/ui';
import { adminSetAccount, decideReport, deletePost, fetchReports } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { ReportCard } from '../../src/lib/types';

type Which = 'open' | 'all';
type Action = 'remove' | 'suspend' | 'dismiss' | 'handled';

const keyOfReport = (r: ReportCard) => r.id;

/** One report: who was reported and by whom, why, the post if it was one, and what can be done. */
const ReportItem = React.memo(function ReportItem({ r, working, onAct, onOpenUser, onOpenPost }: { r: ReportCard; working?: Action; onAct: (r: ReportCard, action: Action) => void; onOpenUser: (id: string) => void; onOpenPost: (id: string) => void }) {
  const who = r.reported_user ?? r.reported_post_owner;
  const media = r.post_media;
  const thumb = media ? (media.type === 'video' ? media.poster : media.url) : undefined;
  const open = r.status === 'open';
  const busy = !!working;
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable disabled={!who} onPress={() => who && onOpenUser(who)} accessibilityRole="button" accessibilityLabel="Open the reported account" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Avatar uri={r.reported_avatar_url} name={r.reported_full_name ?? '?'} size={44} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700' }}>{r.reported_username ? `@${r.reported_username}` : 'Deleted account'}{r.reported_post ? ' · a post' : ''}</Text>
          <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>Reported by @{r.reporter_username ?? 'someone'} · {agoLong(r.created_at)}</Text>
        </View>
        <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: open ? C.like + '29' : C.surface2, justifyContent: 'center' }}>
          <Text style={{ color: open ? C.like : C.fg2, fontSize: 12, fontWeight: '700' }}>{open ? 'Open' : r.status === 'dismissed' ? 'Dismissed' : 'Handled'}</Text>
        </View>
      </View>
      <Text style={{ color: C.fg, lineHeight: 20 }}>{r.reason}</Text>
      {r.reported_post ? (
        <Pressable disabled={!r.post_exists} onPress={() => r.reported_post && onOpenPost(r.reported_post)} accessibilityRole="button" accessibilityLabel={r.post_exists ? 'Open the reported post' : 'The post has been removed'} style={({ pressed }) => ({ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: C.bg2, opacity: pressed ? 0.75 : 1 })}>
          {r.post_exists && thumb ? (
            <Image source={{ uri: thumb }} style={{ width: 54, height: 54, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={r.id} transition={120} />
          ) : (
            <View style={{ width: 54, height: 54, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={r.post_exists ? 'image' : 'trash'} size={22} color={C.fg3} />
            </View>
          )}
          <Text numberOfLines={2} style={{ flex: 1, color: r.post_exists ? C.fg2 : C.fg3, fontSize: 13.5 }}>{r.post_exists ? r.post_caption || 'No caption' : 'Post removed'}</Text>
        </Pressable>
      ) : null}
      {open ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {r.reported_post && r.post_exists ? <Button small kind="danger" label="Remove post" busy={working === 'remove'} disabled={busy && working !== 'remove'} onPress={() => onAct(r, 'remove')} /> : null}
          {who ? <Button small kind="danger" label="Suspend account" busy={working === 'suspend'} disabled={busy && working !== 'suspend'} onPress={() => onAct(r, 'suspend')} /> : null}
          <Button small kind="ghost" label="Dismiss" busy={working === 'dismiss'} disabled={busy && working !== 'dismiss'} onPress={() => onAct(r, 'dismiss')} />
          <Button small kind="ghost" label="Mark as handled" busy={working === 'handled'} disabled={busy && working !== 'handled'} onPress={() => onAct(r, 'handled')} />
        </View>
      ) : null}
    </View>
  );
});

/** What members have flagged: open ones first, or everything; act on each and it updates in place. */
export default function AdminReports() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [which, setWhich] = useState<Which>('open');
  const whichNow = useRef(which);
  whichNow.current = which;
  const [working, setWorking] = useState<Record<string, Action>>({});
  const workingNow = useRef(new Set<string>());

  const fetchPage = useCallback((last: ReportCard | null) => fetchReports(which, last?.created_at), [which]);
  const list = usePagedList(fetchPage, { pageSize: 50, keyOf: keyOfReport });
  const { setItems } = list;

  /** Runs an action on a report; the row shows it working, then leaves Open (or shows its new state in Everything). */
  const run = useCallback(
    async (r: ReportCard, action: Action, work: () => Promise<unknown>, done: string, after: Partial<ReportCard>) => {
      if (workingNow.current.has(r.id)) return;
      workingNow.current.add(r.id);
      setWorking((w) => ({ ...w, [r.id]: action }));
      try {
        await work();
        tap('success');
        toast(done);
        setItems((cur) => {
          if (!cur) return cur;
          const next = whichNow.current === 'open' ? cur.filter((x) => x.id !== r.id) : cur.map((x) => (x.id === r.id ? { ...x, ...after } : x));
          // A removed post is gone for every other report about it too.
          return after.post_exists === false && r.reported_post ? next.map((x) => (x.reported_post === r.reported_post && x.post_exists ? { ...x, post_exists: false } : x)) : next;
        });
      } catch (e) {
        toast(errText(e));
      } finally {
        workingNow.current.delete(r.id);
        setWorking((w) => {
          const next = { ...w };
          delete next[r.id];
          return next;
        });
      }
    },
    [setItems, toast],
  );

  const act = useCallback(
    (r: ReportCard, action: Action) => {
      if (workingNow.current.has(r.id)) return;
      if (action === 'dismiss') {
        run(r, action, () => decideReport(me, r.id, 'dismissed'), 'Report dismissed', { status: 'dismissed' });
      } else if (action === 'handled') {
        run(r, action, () => decideReport(me, r.id, 'actioned'), 'Marked as handled', { status: 'actioned' });
      } else if (action === 'remove') {
        const postId = r.reported_post;
        if (!postId) return;
        Alert.alert('Remove this post?', 'It disappears for everyone.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              run(r, action, async () => { await deletePost(postId); await decideReport(me, r.id, 'actioned'); }, 'Post removed', { status: 'actioned', post_exists: false });
            },
          },
        ]);
      } else {
        const who = r.reported_user ?? r.reported_post_owner;
        if (!who) return;
        Alert.alert(`Suspend ${r.reported_username ? `@${r.reported_username}` : 'this account'}?`, "They can still read, but can't post, comment or message.", [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Suspend',
            style: 'destructive',
            onPress: () => {
              run(r, action, async () => { await adminSetAccount(who, { suspended: true }); await decideReport(me, r.id, 'actioned'); }, 'Account suspended', { status: 'actioned' });
            },
          },
        ]);
      }
    },
    [me, run],
  );

  const openUser = useCallback((id: string) => router.push(`/user/${id}`), [router]);
  const openPost = useCallback((id: string) => router.push(`/post/${id}`), [router]);
  const renderItem = useCallback(({ item }: { item: ReportCard }) => <ReportItem r={item} working={working[item.id]} onAct={act} onOpenUser={openUser} onOpenPost={openPost} />, [working, act, openUser, openPost]);

  return (
    <AdminFrame section="reports" title="Reports">
      <Chips
        value={which}
        onChange={setWhich}
        options={[
          { key: 'open', label: 'Open' },
          { key: 'all', label: 'Everything' },
        ]}
      />
      <SlowLine active={list.slow} />
      {list.items === null ? (
        list.error ? <ErrorNote message={list.error} onRetry={list.retry} /> : <CardsSkeleton />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={keyOfReport}
          renderItem={renderItem}
          extraData={working}
          initialNumToRender={5}
          windowSize={9}
          onEndReached={list.more}
          onEndReachedThreshold={0.6}
          ListFooterComponent={<PageSpinner active={list.paging} />}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={C.fg2} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Empty icon="flag" title={which === 'open' ? 'Nothing waiting' : 'No reports yet'} />}
        />
      )}
    </AdminFrame>
  );
}
