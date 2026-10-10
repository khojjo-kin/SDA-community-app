import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PostGrid } from '../../../src/components/Grid';
import { Icon } from '../../../src/components/Icon';
import { GridSkeleton, Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { Button, Empty, ErrorNote, Field, Loading, Radio, RoundButton, Row, Screen, ScreenHeader, Sheet, SheetRow, Toggle, useToast } from '../../../src/components/ui';
import { canPostIn, deleteGroup, fetchChurches, fetchGroup, fetchGroupPosts, joinGroup, leaveGroup, updateGroup, uploadImage } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { t } from '../../../src/lib/i18n';
import { pickFromLibrary } from '../../../src/lib/pick';
import { useSession } from '../../../src/lib/session';
import { getPostNow } from '../../../src/lib/store';
import { C, errText, fmt } from '../../../src/lib/theme';
import type { Church, Group, Post } from '../../../src/lib/types';

/** What a manager can change. church_name rides along so the screen can show it without another fetch. */
type Form = Pick<Group, 'name' | 'description' | 'privacy' | 'church_id' | 'church_name'>;
type Picked = { uri: string; width: number };

const EMPTY: Form = { name: '', description: '', privacy: 'public', church_id: null, church_name: null };

/** Posts in a private community are for its members; a public group shows them to everyone. App admins see everything. */
function canSee(g: Group, appAdmin: boolean): boolean {
  return g.privacy === 'public' || appAdmin || (g.my_standing !== null && g.my_standing !== 'pending');
}

/**
 * A fresh first page of posts, with the older pages already scrolled through kept after it, so
 * coming back to the group doesn't throw the place away. Null when the fresh page doesn't meet the
 * list shown (everything in it is new), and the list starts again from the fresh page.
 */
function mergeFirst(page: Post[], cur: Post[]): Post[] | null {
  if (!page.length) return page;
  const last = page[page.length - 1].id;
  const at = cur.findIndex((p) => p.id === last);
  if (at < 0) return null;
  const seen = new Set(page.map((p) => p.id));
  // A post deleted meanwhile (or by someone since blocked) has left the shared store: it goes here too.
  return [...page, ...cur.slice(at + 1).filter((p) => !seen.has(p.id) && getPostNow(p.id) !== undefined)];
}

const churchPlace = (c: Church) => [c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ') || undefined;

/** The page while it loads: the cover, the name and its lines, the buttons, then the grid. */
function GroupSkeleton() {
  const { width } = useWindowDimensions();
  const half = (width - 40) / 2;
  return (
    <SkeletonFrame>
      <Skeleton width={width} height={150} radius={0} />
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 9 }}>
        <Skeleton width={Math.round(width * 0.52)} height={20} x={16} />
        <Skeleton width={Math.round(width * 0.28)} height={12} x={16} />
        <Skeleton width={Math.round(width * 0.56)} height={12} x={16} />
        <Skeleton width={width - 32} height={46} radius={12} x={16} style={{ marginTop: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton width={half} height={32} radius={10} x={16} />
          <Skeleton width={half} height={32} radius={10} x={24 + half} />
        </View>
      </View>
      <GridSkeleton rows={2} />
    </SkeletonFrame>
  );
}

export default function GroupPage() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const router = useRouter();
  const toast = useToast();
  const { me, profile } = useSession();
  // undefined while loading, null when the group is gone.
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<'more' | 'edit' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [cover, setCover] = useState<Picked | null>(null);
  const [pickingChurch, setPickingChurch] = useState(false);
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [churchError, setChurchError] = useState('');
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  // Work on its way, against a second tap before the button shows it: joining or leaving, saving.
  const busyNow = useRef(false);
  const savingNow = useRef(false);
  const ending = useRef(false);
  const alive = useRef(true);
  const shown = useRef<Post[] | null>(null);
  shown.current = posts;
  const groupShown = useRef<Group | null | undefined>(undefined);
  groupShown.current = group;
  const loadedOnce = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const appAdmin = !!profile?.admin_role;
  const manager = !!group && (group.my_standing === 'owner' || group.my_standing === 'admin' || appAdmin);
  const owner = !!group && (group.my_standing === 'owner' || appAdmin);

  /** The group and its newest posts. Coming back keeps the posts already scrolled through. */
  const load = useCallback(async (pull = false) => {
    const again = loadedOnce.current;
    loadedOnce.current = true;
    try {
      const g = await fetchGroup(id);
      if (!alive.current) return;
      setGroup(g);
      setError('');
      if (g && canSee(g, appAdmin)) {
        const page = await fetchGroupPosts(id);
        if (!alive.current) return;
        const merged = again && shown.current ? mergeFirst(page, shown.current) : null;
        setPosts(merged ?? page);
        if (!merged) setDone(false);
      } else {
        setPosts([]);
      }
    } catch (e) {
      if (!alive.current) return;
      // A refresh that fails keeps the page as it was, and says why; with nothing shown yet, the error takes the page.
      if (groupShown.current === undefined) setError(errText(e));
      else if (pull) toast(errText(e));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [id, appAdmin, toast]);
  // Reload on focus: a post made in the composer, or members approved on the members screen, should show on return.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** The next page of posts, older than the last one shown. An empty page means there are no more. */
  function more() {
    const last = posts && posts.length ? posts[posts.length - 1] : null;
    if (!last || done || ending.current) return;
    ending.current = true;
    fetchGroupPosts(id, last.created_at)
      .then((page) => {
        if (!alive.current) return;
        if (!page.length) setDone(true);
        else
          setPosts((cur) => {
            const seen = new Set((cur ?? []).map((p) => p.id));
            return [...(cur ?? []), ...page.filter((p) => !seen.has(p.id))];
          });
      })
      .catch((e) => toast(errText(e)))
      .finally(() => {
        ending.current = false;
      });
  }

  /** Join, follow, or ask to join: joinGroup decides from the group's privacy. */
  function join() {
    if (!group || busyNow.current) return;
    const g = group;
    const pending = g.privacy === 'private';
    busyNow.current = true;
    setBusy(true);
    joinGroup(me, g)
      .then(() => {
        tap('success');
        if (alive.current) setGroup((cur) => cur && { ...cur, my_standing: pending ? 'pending' : 'member', member_count: cur.member_count + (pending ? 0 : 1) });
        toast(pending ? t('groups.requestSent') : g.kind === 'page' ? `Following ${g.name}` : `Welcome to ${g.name}`);
      })
      .catch((e) => toast(errText(e)))
      .finally(() => {
        busyNow.current = false;
        if (alive.current) setBusy(false);
      });
  }
  /** Leave, unfollow, or withdraw a pending request: all the same row in the database. */
  function leave() {
    if (!group || busyNow.current) return;
    const pending = group.my_standing === 'pending';
    const page = group.kind === 'page';
    const body = !pending && !page && group.privacy === 'private' ? t('groups.askAgain') : undefined;
    const go = () => {
      if (busyNow.current) return;
      busyNow.current = true;
      setBusy(true);
      leaveGroup(me, id)
        .then(() => {
          if (!alive.current) return;
          setGroup((g) => g && { ...g, my_standing: null, member_count: Math.max(0, g.member_count - (pending ? 0 : 1)) });
          // Leaving a private community hides its posts again.
          if (!appAdmin && group.privacy === 'private') setPosts([]);
        })
        .catch((e) => toast(errText(e)))
        .finally(() => {
          busyNow.current = false;
          if (alive.current) setBusy(false);
        });
    };
    Alert.alert(pending ? 'Cancel your request?' : page ? `Unfollow ${group.name}?` : `Leave ${group.name}?`, body, [
      { text: 'Not now', style: 'cancel' },
      { text: pending ? 'Cancel request' : page ? 'Unfollow' : 'Leave', style: 'destructive', onPress: go },
    ]);
  }

  // Let the sheet slide away before the next thing opens, so the two animations do not overlap.
  const after = (fn: () => void) => () => {
    setSheet(null);
    setTimeout(fn, 380);
  };
  function openEdit() {
    if (!group) return;
    setForm({ name: group.name, description: group.description, privacy: group.privacy, church_id: group.church_id, church_name: group.church_name });
    setCover(null);
    setPickingChurch(false);
    setFormErr('');
    setSheet('edit');
  }
  function loadChurches() {
    setChurchError('');
    fetchChurches()
      .then((l) => {
        if (alive.current) setChurches(l.filter((c) => c.status !== 'rejected'));
      })
      .catch((e) => {
        if (alive.current) setChurchError(errText(e));
      });
  }
  function openChurches() {
    setPickingChurch(true);
    if (churches === null) loadChurches();
  }
  const chooseCover = () =>
    pickFromLibrary()
      .then(([a]) => {
        if (a) setCover({ uri: a.uri, width: a.width });
      })
      .catch((e) => setFormErr(errText(e)));
  async function saveEdit() {
    if (!group || savingNow.current) return;
    const name = form.name.trim();
    if (name.length < 2 || name.length > 80) return setFormErr('Give it a name of 2 to 80 characters.');
    savingNow.current = true;
    setSaving(true);
    setFormErr('');
    try {
      // The cover is uploaded only now, so a cancelled edit leaves nothing behind in storage.
      const cover_url = cover ? (await uploadImage(me, cover.uri, cover.width)).url : group.cover_url;
      const patch = { name, description: form.description.trim(), privacy: group.kind === 'community' ? form.privacy : ('public' as const), church_id: form.church_id, cover_url };
      await updateGroup(group.id, patch);
      if (!alive.current) return;
      setGroup((g) => g && { ...g, ...patch, church_name: form.church_name });
      setSheet(null);
      tap('success');
      toast('Saved');
    } catch (e) {
      if (alive.current) setFormErr(errText(e));
    } finally {
      savingNow.current = false;
      if (alive.current) setSaving(false);
    }
  }
  function confirmDelete() {
    if (!group) return;
    Alert.alert(`Delete ${group.name}?`, 'Its posts and members go with it. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteGroup(id)
            .then(() => {
              toast('Deleted');
              if (router.canGoBack()) router.back();
              else router.replace('/groups' as any);
            })
            .catch((e) => toast(errText(e)));
        },
      },
    ]);
  }

  if (error && group === undefined) return <Screen><ScreenHeader title="Community" /><ErrorNote message={error} onRetry={() => { setError(''); load(); }} /></Screen>;
  if (group === undefined) return <Screen><ScreenHeader title="Community" /><GroupSkeleton /></Screen>;
  if (group === null) return <Screen><ScreenHeader title="Community" /><Empty icon="users" title="This one isn't here any more" /></Screen>;

  const page = group.kind === 'page';
  const visible = canSee(group, appAdmin);
  const standing = group.my_standing;
  const editLabel = page ? 'Edit page' : 'Edit community';
  const primary =
    // The owner can't leave (the group would have nobody in charge), so their button edits it instead.
    standing === 'owner' ? <Button label={editLabel} kind="ghost" onPress={openEdit} />
    : standing === 'pending' ? <Button label="Requested" kind="ghost" busy={busy} onPress={leave} />
    : standing ? <Button label={page ? 'Following' : 'Joined'} kind="ghost" busy={busy} onPress={leave} />
    : <Button label={page ? 'Follow' : group.privacy === 'private' ? 'Request to join' : 'Join'} busy={busy} onPress={join} />;

  const head = (
    <View>
      {group.cover_url ? (
        <Image source={{ uri: group.cover_url }} style={{ width: '100%', height: 150, backgroundColor: C.surface }} contentFit="cover" transition={150} cachePolicy="memory-disk" />
      ) : (
        <View style={{ height: 150, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={page ? 'crown' : 'users'} size={56} color={C.accent2} />
        </View>
      )}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 4 }}>
        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800' }}>{group.name}</Text>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5 }}>@{group.handle}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {group.privacy === 'private' ? <Icon name="lock" size={14} color={C.fg2} weight={2.2} /> : null}
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg2, fontSize: 14.5 }}>{`${page ? 'Page' : 'Community'} · ${group.privacy === 'private' ? 'Private' : 'Public'} · ${fmt(group.member_count)} ${page ? 'follower' : 'member'}${group.member_count === 1 ? '' : 's'}`}</Text>
        </View>
        {group.church_name ? (
          <Pressable disabled={!group.church_id} onPress={() => group.church_id && router.push({ pathname: '/church/[id]', params: { id: group.church_id } } as any)} accessibilityRole="button" accessibilityLabel={`Church: ${group.church_name}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, alignSelf: 'flex-start', maxWidth: '100%', opacity: pressed ? 0.6 : 1 })}>
            <Icon name="church" size={15} color={C.fg2} weight={2} />
            <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5, flexShrink: 1 }}>{group.church_name}</Text>
          </Pressable>
        ) : null}
        {group.description ? <Text style={{ color: C.fg, lineHeight: 20, marginTop: 6 }} selectable>{group.description}</Text> : null}
        <View style={{ marginTop: 12 }}>{primary}</View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Button small kind="ghost" label={page ? 'Followers' : 'Members'} onPress={() => router.push({ pathname: '/group-members/[id]', params: { id, kind: group.kind } } as any)} />
            {manager && group.pending_count > 0 ? (
              <View accessibilityLabel={`${group.pending_count} waiting to join`} style={{ position: 'absolute', top: -7, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: C.like, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '700' }}>{fmt(group.pending_count)}</Text>
              </View>
            ) : null}
          </View>
          {canPostIn(group) ? <Button small label="Post" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/create', params: { group: id } } as any)} /> : null}
        </View>
      </View>
    </View>
  );
  const empty = !visible ? (
    <Empty icon="lock" title={`This ${page ? 'page' : 'community'} is private`} />
  ) : posts === null ? (
    <GridSkeleton rows={2} />
  ) : (
    <Empty icon="image" title="No posts yet" />
  );
  const pickChurch = (c: Church | null) => {
    setForm((f) => ({ ...f, church_id: c ? c.id : null, church_name: c ? c.name : null }));
    setPickingChurch(false);
  };

  return (
    <Screen>
      <ScreenHeader title={page ? 'Page' : 'Community'} right={manager ? <RoundButton name="more" label="More options" onPress={() => setSheet('more')} /> : undefined} />
      <PostGrid
        posts={visible ? posts ?? [] : []}
        source={{ from: 'group', groupId: id }}
        subtitle={group.name}
        header={head}
        empty={empty}
        onEnd={more}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load(true);
        }}
      />

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)}>
        <SheetRow first icon="draw" label={editLabel} onPress={after(openEdit)} />
        {owner ? <SheetRow icon="trash" label={page ? 'Delete page' : 'Delete community'} danger onPress={after(confirmDelete)} /> : null}
      </Sheet>

      <Sheet
        visible={sheet === 'edit'}
        onClose={() => setSheet(null)}
        title={pickingChurch ? 'Church' : editLabel}
        tall
        footer={pickingChurch ? undefined : <View style={{ paddingHorizontal: 20, paddingTop: 12 }}><Button label="Save" busy={saving} onPress={saveEdit} /></View>}>
        {pickingChurch ? (
          churches === null ? (
            churchError ? <ErrorNote message={churchError} onRetry={loadChurches} /> : <Loading />
          ) : (
            <FlatList
              data={churches}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingBottom: 8 }}
              initialNumToRender={14}
              ListHeaderComponent={<Row icon="close" title="No church" onPress={() => pickChurch(null)} right={<Radio on={form.church_id === null} />} chevron={false} />}
              renderItem={({ item: c }) => <Row icon="church" title={c.name} sub={churchPlace(c)} onPress={() => pickChurch(c)} right={<Radio on={form.church_id === c.id} />} chevron={false} />}
            />
          )
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 8 }}>
            <Pressable onPress={chooseCover} accessibilityRole="button" accessibilityLabel="Change cover photo" style={({ pressed }) => ({ height: 120, borderRadius: 14, overflow: 'hidden', backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              {cover || group.cover_url ? <Image source={{ uri: cover?.uri ?? group.cover_url }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 10, backgroundColor: 'rgba(10,12,14,0.7)' }}>
                <Icon name="image" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13.5 }}>Change cover</Text>
              </View>
            </Pressable>
            <Field label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} maxLength={80} />
            <Field label="Description" value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder={t('groups.addDescription')} maxLength={500} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
            {page ? null : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="lock" size={22} color={C.fg} />
                <Text style={{ flex: 1, color: C.fg, fontSize: 16 }}>Private</Text>
                <Toggle value={form.privacy === 'private'} onChange={(v) => setForm((f) => ({ ...f, privacy: v ? 'private' : 'public' }))} label="Private" />
              </View>
            )}
            <Pressable onPress={openChurches} accessibilityRole="button" accessibilityLabel={`Church, ${form.church_name ?? 'none'}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, opacity: pressed ? 0.6 : 1 })}>
              <Icon name="church" size={22} color={C.fg} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 16 }}>Church</Text>
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 15, flexShrink: 1 }}>{form.church_name ?? t('groups.none')}</Text>
              <Icon name="right" size={18} color={C.fg2} weight={2} />
            </Pressable>
            {formErr ? <Text style={{ color: C.like, fontSize: 13 }}>{formErr}</Text> : null}
          </ScrollView>
        )}
      </Sheet>
    </Screen>
  );
}
