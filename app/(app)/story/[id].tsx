import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HighlightPicker } from '../../../src/components/HighlightPicker';
import { Icon } from '../../../src/components/Icon';
import { PlayerCtx, PlayerGroup, StoryPlayer } from '../../../src/components/StoryPlayer';
import { StoryReply } from '../../../src/components/StoryReply';
import { Avatar, Empty, IconButton, Loading, Sheet, useToast } from '../../../src/components/ui';
import { addToHighlight, coverOf, createHighlight, deleteStory, fetchStoryTray, fetchStoryViewers, fetchUserStories, markStorySeen } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { announce } from '../../../src/lib/store';
import { C, errText, fmt } from '../../../src/lib/theme';
import type { Profile, Story } from '../../../src/lib/types';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [groups, setGroups] = useState<PlayerGroup<Story>[] | null>(null);
  const [start, setStart] = useState({ g: 0, s: 0 });
  const [viewers, setViewers] = useState<Profile[] | null>(null);
  const [sheet, setSheet] = useState<'viewers' | 'highlight' | null>(null);
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
        let list = tray;
        let at = tray.findIndex((g) => g.user_id === userId);
        if (at < 0) {
          list = await fetchUserStories(userId, me);
          at = 0;
        }
        if (!on) return;
        const g = list[at];
        const firstNew = g ? g.stories.findIndex((s) => !s.seen) : -1;
        setStart({ g: at, s: g && g.user_id !== me && firstNew > 0 ? firstNew : 0 });
        setGroups(list.map((x) => ({ key: x.user_id, user_id: x.user_id, username: x.username, avatar_url: x.avatar_url, entries: x.stories })));
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
  }, [userId, me]);

  function openProfile(uid: string) {
    router.replace(`/user/${uid}`);
  }

  function closeSheet() {
    setSheet(null);
    live.current?.resume();
  }

  function showViewers(ctx: PlayerCtx<Story>) {
    ctx.pause();
    live.current = ctx;
    setViewers(null);
    setSheet('viewers');
    fetchStoryViewers(ctx.entry.id).then(setViewers).catch(() => setViewers([]));
  }

  function remove(ctx: PlayerCtx<Story>) {
    ctx.pause();
    Alert.alert('Delete this story?', 'It stays in any highlight you added it to.', [
      { text: 'Cancel', style: 'cancel', onPress: ctx.resume },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteStory(ctx.entry.id).then(() => { toast('Story deleted'); close(); }).catch((e) => { toast(errText(e)); ctx.resume(); }); } },
    ]);
  }

  function chooseHighlight(ctx: PlayerCtx<Story>) {
    if (ctx.entry.audience === 'close_friends') {
      toast('Close friends stories stay out of highlights, because highlights are for everyone.');
      return;
    }
    ctx.pause();
    live.current = ctx;
    setSheet('highlight');
  }

  async function keep(choice: { id?: string; title: string }) {
    const ctx = live.current;
    setSheet(null);
    if (!ctx) return;
    try {
      if (choice.id) await addToHighlight(me, choice.id, ctx.entry.item);
      else await createHighlight(me, choice.title, [ctx.entry.item]);
      toast(`Added to ${choice.title}`);
    } catch (e) {
      toast(errText(e));
    }
    ctx.resume();
  }

  if (groups === null) return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><Loading /></View>;
  if (!groups.length || !groups[start.g]?.entries.length) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <Empty title="No story to show" body="Stories disappear 24 hours after they are shared." />
        <View style={{ position: 'absolute', top: 60, right: 8 }}>
          <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
        </View>
      </View>
    );
  }

  return (
    <>
      <StoryPlayer
        groups={groups}
        startGroup={start.g}
        startEntry={start.s}
        onClose={close}
        onOpenProfile={openProfile}
        onMention={openProfile}
        onShow={(story) => { if (story.user_id !== me) markStorySeen(me, story.id); }}
        badge={(ctx) =>
          ctx.entry.audience === 'close_friends' ? (
            <View accessibilityLabel="Shared with close friends" style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.close, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="star" size={13} color="#fff" fill />
            </View>
          ) : null
        }
        footer={(ctx) =>
          ctx.group.user_id === me ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 8 }}>
              <Pressable onPress={() => showViewers(ctx)} accessibilityRole="button" accessibilityLabel="See who viewed this story" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46 }}>
                <Icon name="eye" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600' }}>{ctx.entry.view_count === 1 ? 'Seen by 1 person' : `Seen by ${fmt(ctx.entry.view_count)} people`}</Text>
              </Pressable>
              <IconButton name="highlight" label="Add to a highlight" color="#fff" onPress={() => chooseHighlight(ctx)} />
              <IconButton name="trash" label="Delete story" color="#fff" onPress={() => remove(ctx)} />
            </View>
          ) : (
            <StoryReply
              key={ctx.entry.id}
              ownerId={ctx.entry.user_id}
              username={ctx.entry.username}
              allowed={ctx.entry.story_replies === 'everyone' || (ctx.entry.story_replies === 'following' && ctx.entry.follows_viewer)}
              cover={coverOf(ctx.entry.item)}
              onFocus={ctx.pause}
              onBlur={ctx.resume}
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
          <ScrollView>
            {viewers.map((p) => (
              <Pressable key={p.id} onPress={() => { setSheet(null); openProfile(p.id); }} accessibilityRole="button" accessibilityLabel={`${p.full_name}, ${p.username}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Avatar uri={p.avatar_url} name={p.full_name} size={46} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.username}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Sheet>
      <HighlightPicker visible={sheet === 'highlight'} onClose={closeSheet} onPick={keep} />
    </>
  );
}
