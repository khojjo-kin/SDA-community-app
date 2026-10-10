import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DarkEmpty, DarkLoading, DarkStatusBar } from '../../../src/components/OnDark';
import { ActionBar, afterSheet, BarButton, confirmAlert, HighlightBrowser, REPORT_REASONS, shareStoryItem, useStoryHold } from '../../../src/components/StoryChrome';
import { PlayerCtx, StoryPlayer } from '../../../src/components/StoryPlayer';
import { StoryReply } from '../../../src/components/StoryReply';
import { IconButton, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { coverOf, deleteHighlight, fetchHighlight, getProfile, removeHighlightItem, report, setHighlightCover } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { ringColors } from '../../../src/lib/styling';
import { dayLabel, errText } from '../../../src/lib/theme';
import type { Highlight, HighlightItem, Profile } from '../../../src/lib/types';

type Data = { highlight: Highlight; items: HighlightItem[]; owner: Profile | null };
type SheetKind = 'more' | 'report' | 'browse';

export default function HighlightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const highlightId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const hold = useStoryHold();
  const [data, setData] = useState<Data | null | 'missing'>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // The story a sheet was opened for. The story is paused while a sheet is open, so it stays current.
  const live = useRef<PlayerCtx<HighlightItem> | null>(null);
  // Async work finishes after a sheet has closed, so it reads the latest data from here.
  const dataRef = useRef(data);
  dataRef.current = data;
  const alive = useRef(true);
  const editing = useRef(false);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  /** `again` is a reload after Edit highlight: if the highlight has gone, the viewer just closes. */
  const load = useCallback(
    async (again: boolean) => {
      try {
        const res = await fetchHighlight(highlightId);
        if (!alive.current) return;
        if (!res) {
          if (again) close();
          else setData('missing');
          return;
        }
        const owner = await getProfile(res.highlight.user_id);
        if (alive.current) setData({ ...res, owner });
      } catch (e) {
        if (!alive.current) return;
        toast(errText(e));
        if (!again) setData('missing');
      }
    },
    [highlightId, close, toast],
  );

  useEffect(() => {
    setData(null);
    load(false);
  }, [load]);

  // Coming back from Edit highlight: the title, cover or stories may have changed.
  useFocusEffect(
    useCallback(() => {
      if (!editing.current) return;
      editing.current = false;
      load(true);
    }, [load]),
  );

  function openProfile(uid: string) {
    router.replace(`/user/${uid}`);
  }

  const closeSheet = () => setSheet(null);

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

  // Like reaching the end of it: the next story plays, or the viewer closes after the last one.
  async function removeItem() {
    const ctx = live.current;
    const cur = dataRef.current;
    if (!ctx || !cur || cur === 'missing') return;
    const { highlight, items, owner } = cur;
    const at = items.findIndex((i) => i.id === ctx.entry.id);
    await removeHighlightItem(ctx.entry.id);
    const left = items.filter((i) => i.id !== ctx.entry.id);
    toast('Removed from highlight');
    if (!left.length) {
      // An empty highlight would sit on the profile as a blank circle, so offer to tidy it away.
      if (await confirmAlert('This highlight is now empty', `Delete "${highlight.title}" from your profile too?`, 'Delete')) {
        await deleteHighlight(highlight.id);
        toast('Highlight deleted');
      }
      close();
      return;
    }
    // If its picture was the cover, the next story's picture takes over.
    let cover = highlight.cover_url;
    if (cover && cover === coverOf(ctx.entry.item) && !left.some((i) => coverOf(i.item) === cover)) {
      cover = left.map((i) => coverOf(i.item)).find(Boolean) ?? '';
      await setHighlightCover(highlight.id, cover);
    }
    if (at >= left.length) {
      close();
      return;
    }
    if (alive.current) setData({ highlight: { ...highlight, cover_url: cover }, items: left, owner });
  }

  async function removeAll() {
    const cur = dataRef.current;
    if (!cur || cur === 'missing') return;
    if (!(await confirmAlert(`Delete "${cur.highlight.title}"?`, 'The highlight is removed from your profile. Your archive keeps the stories.', 'Delete'))) return;
    await deleteHighlight(cur.highlight.id);
    toast('Highlight deleted');
    close();
  }

  function reportHighlight(reason: string) {
    const cur = dataRef.current;
    setSheet(null);
    if (!cur || cur === 'missing') return;
    report(me, { userId: cur.highlight.user_id }, `${reason} (on a highlight)`)
      .then(() => toast('Thanks. We will review this highlight.'))
      .catch((e) => toast(errText(e)));
  }

  if (data === null) return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><DarkStatusBar /><DarkLoading /></View>;
  if (data === 'missing' || !data.items.length) {
    const mineEmpty = data !== 'missing' && data.highlight.user_id === me;
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <DarkStatusBar />
        <DarkEmpty
          title={data === 'missing' ? "This highlight isn't available" : 'This highlight is empty'}
          body={data === 'missing' ? 'It may have been deleted.' : mineEmpty ? 'Add stories to it from your archive.' : undefined}
        />
        <View style={{ position: 'absolute', top: 60, right: 8 }}>
          <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
        </View>
      </View>
    );
  }

  const { highlight, items, owner } = data;
  const mine = highlight.user_id === me;

  return (
    <>
      <DarkStatusBar />
      <StoryPlayer
        key={highlight.id}
        groups={[{ key: highlight.id, user_id: highlight.user_id, username: owner?.username ?? '', avatar_url: owner?.avatar_url ?? '', verified: !!owner?.verified, entries: items }]}
        held={sheet !== null || hold.held}
        onClose={close}
        onOpenProfile={openProfile}
        onMention={openProfile}
        subtitle={() => highlight.title}
        actions={(ctx) => (mine ? null : <IconButton name="more" label="More options" size={22} color="#fff" onPress={() => { live.current = ctx; setSheet('more'); }} />)}
        footer={(ctx) =>
          mine ? (
            <ActionBar>
              {/* Highlights keep no list of viewers, so this shows when the story was added instead. */}
              <BarButton icon="activity" label={dayLabel(new Date(ctx.entry.created_at))} a11y={`Added ${dayLabel(new Date(ctx.entry.created_at))}`} onPress={() => toast(`Added to this highlight on ${dayLabel(new Date(ctx.entry.created_at))}`)} />
              <BarButton icon="browse" label="Browse" onPress={() => { live.current = ctx; setSheet('browse'); }} />
              <BarButton icon="more" label="More" onPress={() => { live.current = ctx; setSheet('more'); }} />
            </ActionBar>
          ) : (
            <StoryReply
              key={ctx.entry.id}
              ownerId={highlight.user_id}
              username={owner?.username ?? 'them'}
              allowed={!!owner && !owner.is_blocked && (owner.story_replies === 'everyone' || (owner.story_replies === 'following' && owner.follows_me))}
              cover={coverOf(ctx.entry.item)}
              onFocus={() => hold.setTyping(true)}
              onBlur={() => hold.setTyping(false)}
            />
          )
        }
      />

      {/* More, and Report as its second page: one sheet, so nothing has to slide away in between. */}
      <Sheet visible={sheet === 'more' || sheet === 'report'} onClose={closeSheet} title={sheet === 'report' ? 'Why are you reporting this highlight?' : undefined}>
        {sheet === 'report' ? (
          <>
            {REPORT_REASONS.map((r, i) => (
              <SheetRow key={r} first={i === 0} icon="flag" label={r} onPress={() => reportHighlight(r)} />
            ))}
            <SheetRow icon="close" label="Cancel" onPress={closeSheet} />
          </>
        ) : mine ? (
          <>
            <SheetRow first icon="highlight" label="Remove from highlight" danger onPress={fromSheet(removeItem)} />
            <SheetRow icon="compose" label="Edit highlight" onPress={fromSheet(() => { editing.current = true; hold.leave(); router.push(`/highlight-edit/${highlight.id}`); })} />
            <SheetRow icon="share" label="Share…" onPress={fromSheet(() => (live.current ? shareStoryItem(live.current.entry.item) : undefined))} />
            <SheetRow icon="trash" label="Delete highlight" danger onPress={fromSheet(removeAll)} />
            <SheetRow icon="close" label="Cancel" onPress={closeSheet} />
          </>
        ) : (
          <>
            <SheetRow first icon="flag" label="Report" danger onPress={() => setSheet('report')} />
            <SheetRow icon="close" label="Cancel" onPress={closeSheet} />
          </>
        )}
      </Sheet>

      {mine ? (
        <HighlightBrowser
          visible={sheet === 'browse'}
          userId={highlight.user_id}
          currentId={highlight.id}
          ring={ringColors(owner?.ring_color)}
          onClose={closeSheet}
          onPick={(hid) => (hid === highlight.id ? closeSheet() : fromSheet(() => router.replace(`/highlight/${hid}`))())}
        />
      ) : null}
    </>
  );
}
