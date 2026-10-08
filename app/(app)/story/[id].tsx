import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../../src/components/Icon';
import { Avatar, Empty, IconButton, Loading, useToast } from '../../../src/components/ui';
import { deleteStory, fetchStoryTray, fetchUserStories, markStorySeen, openThread, sendMessage } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { announce } from '../../../src/lib/store';
import { ago, C, errText, fmt } from '../../../src/lib/theme';
import type { StoryGroup } from '../../../src/lib/types';

const DURATION = 5000;

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [gi, setGi] = useState(0);
  const [si, setSi] = useState(0);
  const [reply, setReply] = useState('');
  const [liked, setLiked] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const paused = useRef(false);
  const closed = useRef(false);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    progress.stopAnimation();
    announce('stories');
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [progress, router]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const tray = await fetchStoryTray(me);
        let list = tray;
        let at = tray.findIndex((g) => g.user_id === userId);
        if (at < 0) {
          list = await fetchUserStories(userId, me);
          at = 0;
        }
        if (!live) return;
        setGroups(list);
        setGi(at);
        const g = list[at];
        const firstNew = g ? g.stories.findIndex((s) => !s.seen) : -1;
        setSi(g && g.user_id !== me && firstNew > 0 ? firstNew : 0);
      } catch (e) {
        if (live) {
          toast(errText(e));
          setGroups([]);
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, me]);

  const group = groups?.[gi];
  const story = group?.stories[si];

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!groups || !group) return;
      if (dir === 1) {
        if (si < group.stories.length - 1) setSi(si + 1);
        else if (gi < groups.length - 1) {
          setGi(gi + 1);
          setSi(0);
        } else close();
      } else if (si > 0) setSi(si - 1);
      else if (gi > 0) {
        setGi(gi - 1);
        setSi(0);
      } else {
        progress.setValue(0);
        run(0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, group, gi, si, close],
  );

  const stepRef = useRef(step);
  stepRef.current = step;

  function run(from: number) {
    Animated.timing(progress, { toValue: 1, duration: Math.max(1, (1 - from) * DURATION), easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished && !closed.current) stepRef.current(1);
    });
  }

  useEffect(() => {
    if (!story) return;
    setLiked(false);
    setReply('');
    paused.current = false;
    progress.setValue(0);
    run(0);
    if (story.user_id !== me) markStorySeen(me, story.id);
    return () => progress.stopAnimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  const pause = () => {
    if (paused.current) return;
    paused.current = true;
    progress.stopAnimation();
  };
  const resume = () => {
    if (!paused.current) return;
    paused.current = false;
    progress.stopAnimation((v) => run(v));
  };

  async function send(text: string) {
    if (!group || !text.trim()) return;
    try {
      const tid = await openThread(group.user_id);
      await sendMessage(me, tid, { text });
      setReply('');
      toast('Reply sent');
    } catch (e) {
      toast(errText(e));
    }
  }

  function remove() {
    if (!story) return;
    pause();
    Alert.alert('Delete this story?', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: resume },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteStory(story.id).then(() => { toast('Story deleted'); close(); }).catch((e) => { toast(errText(e)); resume(); }); } },
    ]);
  }

  if (groups === null) return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><Loading /></View>;
  if (!group || !story) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <Empty title="No story to show" body="Stories disappear 24 hours after they are shared." />
        <View style={{ position: 'absolute', top: insets.top + 6, right: 8 }}>
          <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
        </View>
      </View>
    );
  }

  const mine = group.user_id === me;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Image source={{ uri: story.item.url }} style={{ position: 'absolute', width, height }} contentFit="cover" transition={120} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} locations={[0, 0.22, 0.72, 1]} style={{ position: 'absolute', width, height }} />

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Pressable style={{ flex: 1 }} onPress={() => step(-1)} onLongPress={() => {}} delayLongPress={220} onPressIn={pause} onPressOut={resume} accessibilityLabel="Previous story" />
        <Pressable style={{ flex: 2 }} onPress={() => step(1)} onLongPress={() => {}} delayLongPress={220} onPressIn={pause} onPressOut={resume} accessibilityLabel="Next story" />
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0 }}>
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 10 }}>
          {group.stories.map((s, i) => (
            <View key={s.id} style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
              {i < si ? <View style={{ flex: 1, backgroundColor: '#fff' }} /> : i === si ? <Animated.View style={{ height: 2.5, backgroundColor: '#fff', width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /> : null}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 6, paddingTop: 10 }}>
          <Pressable onPress={() => { close(); setTimeout(() => router.push(`/user/${group.user_id}`), 60); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${group.username}'s profile`}>
            <Avatar uri={group.avatar_url} name={group.username} size={34} />
            <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '600', flexShrink: 1 }}>{group.username}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13.5 }}>{ago(story.created_at)}</Text>
          </Pressable>
          <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: insets.bottom + 12, paddingTop: 8 }}>
        {mine ? (
          <>
            <Icon name="eye" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', flex: 1 }}>{story.view_count === 1 ? 'Seen by 1 person' : `Seen by ${fmt(story.view_count)} people`}</Text>
            <IconButton name="trash" label="Delete story" color="#fff" onPress={remove} />
          </>
        ) : (
          <>
            <TextInput value={reply} onChangeText={setReply} onFocus={pause} onBlur={resume} onSubmitEditing={() => send(reply)} returnKeyType="send" placeholder={`Reply to ${group.username}…`} placeholderTextColor="rgba(255,255,255,0.8)" maxLength={300} keyboardAppearance="dark" style={{ flex: 1, height: 46, paddingHorizontal: 18, borderRadius: 23, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', color: '#fff', fontSize: 16 }} accessibilityLabel="Reply to story" />
            <IconButton name="heart" label="Send a heart" size={28} color={liked ? C.like : '#fff'} fill={liked} onPress={() => { if (!liked) { setLiked(true); send('❤️'); } }} />
            <IconButton name="send" label="Send reply" size={26} color="#fff" onPress={() => send(reply)} />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
