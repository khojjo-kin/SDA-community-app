import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HighlightPicker } from '../../../src/components/HighlightPicker';
import { markMemoryJustMade } from '../../../src/components/HighlightsRow';
import { Icon, VerifiedTick } from '../../../src/components/Icon';
import { DarkEmpty, DarkLoading, DarkStatusBar } from '../../../src/components/OnDark';
import { ActionBar, afterSheet, BarButton, confirmAlert, PeopleSheet, REPORT_REASONS, shareStoryItem, storyWords, useStoryHold } from '../../../src/components/StoryChrome';
import { PlayerCtx, PlayerGroup, StoryPlayer } from '../../../src/components/StoryPlayer';
import { StoryReply } from '../../../src/components/StoryReply';
import { Avatar, Empty, IconButton, Loading, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { addToHighlight, coverOf, createHighlight, deleteStory, fetchStoryTray, fetchStoryViewersDetailed, fetchStoryWatchList, fetchUserStories, markStorySeen, report, sendToPeople, setStoryWatch } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { useSession } from '../../../src/lib/session';
import { announce } from '../../../src/lib/store';
import { supabase } from '../../../src/lib/supabase';
import { C, DARK, dayLabel, errText, fmt } from '../../../src/lib/theme';
import type { Profile, Story, StoryViewer } from '../../../src/lib/types';

type SheetKind = 'viewers' | 'highlight' | 'more' | 'report' | 'mention' | 'send';

/**
 * Story cards do not carry the verified tick, so it is looked up once for everyone in the tray.
 * (Kept here rather than in api.ts; it could move there as `fetchVerified(ids)`.)
 */
async function verifiedAmong(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from('community_profile_cards').select('id,verified').in('id', ids);
  if (error) throw error;
  return new Set(((data ?? []) as { id: string; verified: boolean }[]).filter((r) => r.verified).map((r) => r.id));
}

/** "2:41 pm", "Yesterday, 2:41 pm" or "9 Oct, 2:41 pm": when someone last watched. */
function viewTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400e3);
  if (days <= 0) return time;
  return days === 1 ? `Yesterday, ${time}` : `${dayLabel(d)}, ${time}`;
}

export default function StoryScreen() {
  const params = useLocalSearchParams<{ id: string; quiet?: string }>();
  const userId = String(params.id);
  const { me, profile } = useSession();
  const plus = !!profile?.plus;
  // A Plus member's quiet preview (held down in the tray): nothing is recorded, so they are not on the viewer list.
  const quiet = params.quiet === '1' && plus && userId !== me;
  const router = useRouter();
  const toast = useToast();
  const hold = useStoryHold();
  const [groups, setGroups] = useState<PlayerGroup<Story>[] | null>(null);
  const [start, setStart] = useState({ g: 0, s: 0 });
  const [viewers, setViewers] = useState<StoryViewer[] | null>(null);
  // Plus: the viewers whose watching I'm told about (the bell on each row).
  const [watching, setWatching] = useState<Set<string> | null>(null);
  const watchSaving = useRef(new Set<string>());
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // The story a sheet was opened for. The story is paused while a sheet is open, so it stays current.
  const live = useRef<PlayerCtx<Story> | null>(null);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // However the screen is left (Close, the last story ending, or a swipe down), the rings on the home screen update.
  useEffect(() => () => announce('stories'), []);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const tray = await fetchStoryTray(me);
        // A quiet preview shows only the person it was opened for, rather than running on into the next tray.
        let list = quiet ? tray.filter((g) => g.user_id === userId) : tray;
        let at = list.findIndex((g) => g.user_id === userId);
        if (at < 0) {
          list = await fetchUserStories(userId, me);
          at = 0;
        }
        if (!on) return;
        const g = list[at];
        const firstNew = g ? g.stories.findIndex((s) => !s.seen) : -1;
        setStart({ g: at, s: g && g.user_id !== me && firstNew > 0 ? firstNew : 0 });
        setGroups(list.map((x) => ({ key: x.user_id, user_id: x.user_id, username: x.username, avatar_url: x.avatar_url, entries: x.stories })));
        // The ticks arrive a moment later; the stories do not wait for them.
        verifiedAmong(list.map((x) => x.user_id))
          .then((ticked) => {
            if (on && ticked.size) setGroups((cur) => cur && cur.map((x) => ({ ...x, verified: ticked.has(x.user_id) })));
          })
          .catch(() => {});
      } catch (e) {
        if (on) {
          toast(errText(e));
          setGroups([]);
        }
      }
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, me, quiet]);

  function openProfile(uid: string) {
    router.replace(`/user/${uid}`);
  }

  const closeSheet = () => setSheet(null);

  function open(kind: SheetKind, ctx: PlayerCtx<Story>) {
    live.current = ctx;
    if (kind === 'viewers') {
      setViewers(null);
      fetchStoryViewersDetailed(ctx.entry.id).then(setViewers).catch(() => setViewers([]));
      setWatching(null);
      if (plus) fetchStoryWatchList(me).then((list) => setWatching(new Set(list.map((p) => p.id)))).catch(() => setWatching(new Set()));
    }
    setSheet(kind);
  }

  /** Plus: "Tell me when they watch" on one viewer. Shown at once, put back if the save fails. */
  async function toggleWatch(p: Profile) {
    if (!watching || watchSaving.current.has(p.id)) return;
    const on = !watching.has(p.id);
    const flip = (cur: Set<string> | null, add: boolean) => {
      const next = new Set(cur ?? []);
      if (add) next.add(p.id);
      else next.delete(p.id);
      return next;
    };
    watchSaving.current.add(p.id);
    tap('select');
    setWatching((cur) => flip(cur, on));
    try {
      await setStoryWatch(me, p.id, on);
      toast(on ? `We'll tell you when ${p.username} watches your stories` : `Story alerts off for ${p.username}`);
    } catch (e) {
      setWatching((cur) => flip(cur, !on));
      toast(errText(e));
    } finally {
      watchSaving.current.delete(p.id);
    }
  }

  /** Closes the sheet, waits for it to slide away, then runs `work` with the story still paused. */
  function fromSheet(work: () => unknown) {
    return () => {
      setSheet(null);
      hold.busy(async () => {
        await afterSheet();
        await work();
      }).catch((e) => toast(errText(e)));
    };
  }

  function share(ctx: PlayerCtx<Story>) {
    hold.busy(() => shareStoryItem(ctx.entry.item)).catch((e) => toast(errText(e)));
  }

  async function removeStory() {
    const ctx = live.current;
    if (!ctx) return;
    if (!(await confirmAlert('Delete this story?', 'It stays in any memory you added it to.', 'Delete'))) return;
    await deleteStory(ctx.entry.id);
    toast('Story deleted');
    close();
  }

  function chooseHighlight() {
    if (live.current?.entry.audience === 'close_friends') {
      setSheet(null);
      toast('Close friends stories stay out of memories, because memories are for everyone.');
      return;
    }
    fromSheet(() => setSheet('highlight'))();
  }

  async function keep(choice: { id?: string; title: string }) {
    const ctx = live.current;
    setSheet(null);
    if (!ctx) return;
    try {
      if (choice.id) await addToHighlight(me, choice.id, ctx.entry.item);
      else {
        const made = await createHighlight(me, choice.title, [ctx.entry.item]);
        // A new memory: its ring turns once when the profile next shows it, as from New memory.
        markMemoryJustMade(made);
      }
      toast(`Added to ${choice.title}`);
    } catch (e) {
      toast(errText(e));
    }
  }

  // Mention: a message to each person, with the story's picture, so they know they are in it.
  async function mention(ids: string[]) {
    const ctx = live.current;
    if (!ctx) return;
    const cover = coverOf(ctx.entry.item);
    await sendToPeople(me, ids, { media: cover ? [cover] : [], text: 'Mentioned you in their story' });
    setSheet(null);
    toast(ids.length > 1 ? `Sent to ${ids.length} people` : 'Sent');
  }

  async function send(ids: string[], note: string) {
    const ctx = live.current;
    if (!ctx) return;
    const cover = coverOf(ctx.entry.item);
    // A text story has no picture, so its words go instead.
    const text = note || (cover ? '' : storyWords(ctx.entry.item));
    if (!cover && !text) throw new Error('Add a message to send with this story.');
    await sendToPeople(me, ids, { media: cover ? [cover] : [], text });
    setSheet(null);
    toast(ids.length > 1 ? `Sent to ${ids.length} people` : 'Sent');
  }

  function reportStory(reason: string) {
    const ctx = live.current;
    setSheet(null);
    if (!ctx) return;
    report(me, { userId: ctx.group.user_id }, `${reason} (on a story)`)
      .then(() => toast('Thanks. We will review this story.'))
      .catch((e) => toast(errText(e)));
  }

  if (groups === null) return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><DarkStatusBar /><DarkLoading /></View>;
  if (!groups.length || !groups[start.g]?.entries.length) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <DarkStatusBar />
        <DarkEmpty title="No story to show" body="Stories disappear 24 hours after they are shared." />
        <View style={{ position: 'absolute', top: 60, right: 8 }}>
          <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
        </View>
      </View>
    );
  }

  const mine = live.current?.group.user_id === me;
  const seenBy = live.current?.entry.view_count ?? 0;

  return (
    <>
      <DarkStatusBar />
      <StoryPlayer
        groups={groups}
        startGroup={start.g}
        startEntry={start.s}
        held={sheet !== null || hold.held}
        onClose={close}
        onOpenProfile={openProfile}
        onMention={openProfile}
        onShow={(story) => { if (story.user_id !== me) markStorySeen(me, story.id, quiet).catch(() => {}); }}
        notice={quiet ? "Preview — they won't see you watched" : undefined}
        badge={(ctx) =>
          ctx.entry.audience === 'close_friends' ? (
            <View accessibilityLabel="Shared with close friends" style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: DARK.close, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="star" size={12} color="#fff" fill />
            </View>
          ) : null
        }
        actions={(ctx) => (ctx.group.user_id !== me ? <IconButton name="more" label="More options" size={22} color="#fff" onPress={() => open('more', ctx)} /> : null)}
        footer={(ctx) =>
          ctx.group.user_id === me ? (
            <ActionBar>
              <BarButton icon="eye" label="Activity" count={ctx.entry.view_count} a11y={ctx.entry.view_count === 1 ? 'Activity: seen by 1 person' : `Activity: seen by ${fmt(ctx.entry.view_count)} people`} onPress={() => open('viewers', ctx)} />
              <BarButton icon="share" label="Share on…" onPress={() => share(ctx)} />
              <BarButton icon="at" label="Mention" onPress={() => open('mention', ctx)} />
              <BarButton icon="send" label="Send" onPress={() => open('send', ctx)} />
              <BarButton icon="more" label="More" onPress={() => open('more', ctx)} />
            </ActionBar>
          ) : (
            <StoryReply
              key={ctx.entry.id}
              ownerId={ctx.entry.user_id}
              username={ctx.entry.username}
              allowed={ctx.entry.story_replies === 'everyone' || (ctx.entry.story_replies === 'following' && ctx.entry.follows_viewer)}
              cover={coverOf(ctx.entry.item)}
              onFocus={() => hold.setTyping(true)}
              onBlur={() => hold.setTyping(false)}
            />
          )
        }
      />

      <Sheet visible={sheet === 'viewers'} onClose={closeSheet} title="Viewers" tall>
        {viewers === null ? (
          <Loading />
        ) : viewers.length === 0 ? (
          <Empty icon="eye" title="No views yet" body="People who see this story will be listed here." />
        ) : (
          <ScrollView style={{ flex: 1 }}>
            <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 8 }}>{seenBy === 1 ? 'Seen by 1 person' : `Seen by ${fmt(Math.max(seenBy, viewers.length))} people`}</Text>
            {plus ? null : (
              <Pressable
                onPress={fromSheet(() => { hold.leave(); router.push('/plus'); })}
                accessibilityRole="button"
                accessibilityLabel="See rewatches and times with Plus"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? C.press : C.accentSoft })}>
                <Icon name="crown" size={18} color={C.accent2} />
                <Text style={{ flex: 1, color: C.fg, fontSize: 14 }}>See rewatches and times with Plus</Text>
                <Icon name="right" size={14} color={C.fg2} weight={2} />
              </Pressable>
            )}
            {viewers.map((v) => {
              const p = v.profile;
              if (!p) return null;
              const on = !!watching?.has(p.id);
              // Plus owners see how often and when; everyone sees who.
              const times = plus && v.view_count > 1 ? `Watched ${fmt(v.view_count)} times` : '';
              return (
                <View key={v.viewer_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 8, paddingVertical: 8 }}>
                  <Pressable onPress={() => { setSheet(null); openProfile(p.id); }} accessibilityRole="button" accessibilityLabel={[`${p.full_name}, ${p.username}`, times, plus ? `last watched ${viewTime(v.last_viewed_at)}` : ''].filter(Boolean).join(', ')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar uri={p.avatar_url} name={p.full_name} size={46} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{p.username}</Text>
                        {p.verified ? <VerifiedTick size={14} /> : null}
                      </View>
                      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text>
                      {times ? <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 12.5, fontWeight: '600', marginTop: 1 }}>{times}</Text> : null}
                    </View>
                    {plus ? <Text style={{ color: C.fg3, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{viewTime(v.last_viewed_at)}</Text> : null}
                  </Pressable>
                  {plus ? (
                    <IconButton
                      name="bell"
                      size={22}
                      fill={on}
                      color={on ? C.accent2 : C.fg2}
                      label={on ? `Stop telling me when ${p.username} watches` : `Tell me when ${p.username} watches`}
                      onPress={() => toggleWatch(p)}
                    />
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </Sheet>

      {/* More, and Report as its second page: one sheet, so nothing has to slide away in between. */}
      <Sheet visible={sheet === 'more' || sheet === 'report'} onClose={closeSheet} title={sheet === 'report' ? 'Why are you reporting this story?' : undefined}>
        {sheet === 'report' ? (
          <>
            {REPORT_REASONS.map((r, i) => (
              <SheetRow key={r} first={i === 0} icon="flag" label={r} onPress={() => reportStory(r)} />
            ))}
            <SheetRow icon="close" label="Cancel" onPress={closeSheet} />
          </>
        ) : mine ? (
          <>
            <SheetRow first icon="trash" label="Delete story" danger onPress={fromSheet(removeStory)} />
            <SheetRow icon="highlight" label="Add to memory" onPress={chooseHighlight} />
            <SheetRow icon="settings" label="Story settings" sub="Replies, close friends and your archive" onPress={fromSheet(() => { hold.leave(); router.push('/story-settings'); })} />
            <SheetRow icon="close" label="Cancel" onPress={closeSheet} />
          </>
        ) : (
          <>
            <SheetRow first icon="flag" label="Report" danger onPress={() => setSheet('report')} />
            <SheetRow icon="close" label="Cancel" onPress={closeSheet} />
          </>
        )}
      </Sheet>

      <PeopleSheet visible={sheet === 'mention'} title="Mention" verb="Mention" which="following" onClose={closeSheet} onSend={(ids) => mention(ids)} />
      <PeopleSheet visible={sheet === 'send'} title="Send to" verb="Send" which="recent" note onClose={closeSheet} onSend={send} />
      <HighlightPicker visible={sheet === 'highlight'} onClose={closeSheet} onPick={keep} />
    </>
  );
}
