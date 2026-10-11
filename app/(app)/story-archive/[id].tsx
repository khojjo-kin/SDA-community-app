import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HighlightPicker } from '../../../src/components/HighlightPicker';
import { markMemoryJustMade } from '../../../src/components/HighlightsRow';
import { Icon } from '../../../src/components/Icon';
import { DarkEmpty, DarkLoading, DarkStatusBar } from '../../../src/components/OnDark';
import { ActionBar, BarButton } from '../../../src/components/StoryChrome';
import { PlayerCtx, StoryPlayer } from '../../../src/components/StoryPlayer';
import { IconButton, useToast } from '../../../src/components/ui';
import { addStory, addToHighlight, createHighlight, deleteStory, fetchArchive } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { DARK, dayLabel, errText } from '../../../src/lib/theme';
import type { ArchivedStory } from '../../../src/lib/types';

/** Looks back through your own stories, including ones that have expired. */
export default function ArchivedStories() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, profile } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [entries, setEntries] = useState<ArchivedStory[] | null>(null);
  const [start, setStart] = useState(0);
  const [picking, setPicking] = useState(false);
  const live = useRef<PlayerCtx<ArchivedStory> | null>(null);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  useEffect(() => {
    let on = true;
    fetchArchive(me)
      .then((list) => {
        if (!on) return;
        const oldestFirst = [...list].reverse();
        setStart(Math.max(0, oldestFirst.findIndex((s) => s.id === String(id))));
        setEntries(oldestFirst);
      })
      .catch((e) => {
        if (on) {
          toast(errText(e));
          setEntries([]);
        }
      });
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, id]);

  function remove(ctx: PlayerCtx<ArchivedStory>) {
    ctx.pause();
    Alert.alert('Delete this story?', 'It is removed from your archive, and from your story if it is still showing. Memories keep their copy.', [
      { text: 'Cancel', style: 'cancel', onPress: ctx.resume },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteStory(ctx.entry.id)
            .then(() => {
              toast('Story deleted');
              const left = (entries ?? []).filter((s) => s.id !== ctx.entry.id);
              if (!left.length) close();
              else setEntries(left);
            })
            .catch((e) => {
              toast(errText(e));
              ctx.resume();
            });
        },
      },
    ]);
  }

  function again(ctx: PlayerCtx<ArchivedStory>) {
    ctx.pause();
    // It goes back to the same people who could see it the first time.
    const friendsOnly = ctx.entry.audience === 'close_friends';
    Alert.alert('Share this to your story again?', friendsOnly ? 'Only your close friends will see it, for another 24 hours.' : 'It will show on your story for another 24 hours.', [
      { text: 'Cancel', style: 'cancel', onPress: ctx.resume },
      { text: 'Share', onPress: () => { addStory(me, ctx.entry.item, ctx.entry.audience).then(() => toast(friendsOnly ? 'Shared with your close friends' : 'Added to your story')).catch((e) => toast(errText(e))).finally(ctx.resume); } },
    ]);
  }

  function chooseHighlight(ctx: PlayerCtx<ArchivedStory>) {
    if (ctx.entry.audience === 'close_friends') {
      toast('Close friends stories stay out of memories, because memories are for everyone.');
      return;
    }
    ctx.pause();
    live.current = ctx;
    setPicking(true);
  }

  async function keep(choice: { id?: string; title: string }) {
    const ctx = live.current;
    setPicking(false);
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
    ctx.resume();
  }

  if (entries === null) return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><DarkStatusBar /><DarkLoading /></View>;
  if (!entries.length) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <DarkStatusBar />
        <DarkEmpty icon="archive" title="Nothing in your archive" />
        <View style={{ position: 'absolute', top: insets.top + 8, right: 8 }}>
          <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
        </View>
      </View>
    );
  }

  return (
    <>
      <DarkStatusBar />
      <StoryPlayer
        groups={[{ key: 'archive', user_id: me, username: profile?.username ?? '', avatar_url: profile?.avatar_url ?? '', entries }]}
        startEntry={start}
        onClose={close}
        showTime={false}
        badge={(ctx) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13.5 }}>{dayLabel(new Date(ctx.entry.created_at))}</Text>
            {ctx.entry.audience === 'close_friends' ? (
              <View accessibilityLabel="Shared with close friends" style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: DARK.close, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={13} color="#fff" fill />
              </View>
            ) : null}
          </View>
        )}
        footer={(ctx) => (
          <ActionBar>
            <BarButton icon="highlight" label="Memory" onPress={() => chooseHighlight(ctx)} />
            <BarButton icon="story" label="Share again" onPress={() => again(ctx)} />
            <BarButton icon="trash" label="Delete" onPress={() => remove(ctx)} />
          </ActionBar>
        )}
      />
      <HighlightPicker visible={picking} onClose={() => { setPicking(false); live.current?.resume(); }} onPick={keep} />
    </>
  );
}
