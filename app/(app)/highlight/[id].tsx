import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon, IconName } from '../../../src/components/Icon';
import { PlayerCtx, StoryPlayer } from '../../../src/components/StoryPlayer';
import { StoryReply } from '../../../src/components/StoryReply';
import { Empty, IconButton, Loading, useToast } from '../../../src/components/ui';
import { coverOf, deleteHighlight, fetchHighlight, getProfile, removeHighlightItem, renameHighlight, setHighlightCover } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { errText } from '../../../src/lib/theme';
import type { Highlight, HighlightItem, Profile } from '../../../src/lib/types';

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={24} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export default function HighlightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const highlightId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<{ highlight: Highlight; items: HighlightItem[]; owner: Profile | null } | null | 'missing'>(null);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetchHighlight(highlightId);
        if (!on) return;
        if (!res) return setData('missing');
        const owner = await getProfile(res.highlight.user_id);
        if (on) setData({ ...res, owner });
      } catch (e) {
        if (on) {
          toast(errText(e));
          setData('missing');
        }
      }
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  function openProfile(uid: string) {
    router.replace(`/user/${uid}`);
  }

  if (data === null) return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><Loading /></View>;
  if (data === 'missing' || !data.items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <Empty title={data === 'missing' ? "This highlight isn't available" : 'This highlight is empty'} body={data === 'missing' ? 'It may have been deleted.' : 'Add stories to it from your archive.'} />
        <View style={{ position: 'absolute', top: 60, right: 8 }}>
          <IconButton name="close" label="Close" size={28} color="#fff" onPress={close} />
        </View>
      </View>
    );
  }

  const { highlight, items, owner } = data;
  const mine = highlight.user_id === me;

  function rename(ctx: PlayerCtx<HighlightItem>) {
    ctx.pause();
    Alert.prompt(
      'Rename highlight',
      undefined,
      [
        { text: 'Cancel', style: 'cancel', onPress: ctx.resume },
        {
          text: 'Save',
          onPress: (text?: string) => {
            const title = (text ?? '').trim().slice(0, 30);
            if (title) renameHighlight(highlight.id, title).then(() => setData({ highlight: { ...highlight, title }, items, owner })).catch((e) => toast(errText(e)));
            ctx.resume();
          },
        },
      ],
      'plain-text',
      highlight.title,
    );
  }

  function removeItem(ctx: PlayerCtx<HighlightItem>) {
    ctx.pause();
    Alert.alert('Remove this story from the highlight?', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: ctx.resume },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeHighlightItem(ctx.entry.id)
            .then(async () => {
              const left = items.filter((i) => i.id !== ctx.entry.id);
              if (!left.length) {
                // An empty highlight would sit on the profile as a blank circle, so it goes too.
                await deleteHighlight(highlight.id);
                toast('Highlight deleted');
                close();
                return;
              }
              let cover = highlight.cover_url;
              if (cover && cover === coverOf(ctx.entry.item)) {
                cover = left.map((i) => coverOf(i.item)).find(Boolean) ?? '';
                await setHighlightCover(highlight.id, cover);
              }
              setData({ highlight: { ...highlight, cover_url: cover }, items: left, owner });
            })
            .catch((e) => {
              toast(errText(e));
              ctx.resume();
            });
        },
      },
    ]);
  }

  function removeAll(ctx: PlayerCtx<HighlightItem>) {
    ctx.pause();
    Alert.alert(`Delete "${highlight.title}"?`, 'The highlight is removed from your profile. Your archive keeps the stories.', [
      { text: 'Cancel', style: 'cancel', onPress: ctx.resume },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteHighlight(highlight.id).then(() => { toast('Highlight deleted'); close(); }).catch((e) => { toast(errText(e)); ctx.resume(); }); } },
    ]);
  }

  return (
    <StoryPlayer
      groups={[{ key: highlight.id, user_id: highlight.user_id, username: owner?.username ?? '', avatar_url: owner?.avatar_url ?? '', entries: items }]}
      onClose={close}
      onOpenProfile={openProfile}
      onMention={openProfile}
      showTime={false}
      badge={() => <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13.5, flexShrink: 1 }}>{highlight.title}</Text>}
      footer={(ctx) =>
        mine ? (
          <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
            <Action icon="compose" label="Rename" onPress={() => rename(ctx)} />
            <Action icon="close" label="Remove story" onPress={() => removeItem(ctx)} />
            <Action icon="trash" label="Delete highlight" onPress={() => removeAll(ctx)} />
          </View>
        ) : (
          <StoryReply
            key={ctx.entry.id}
            ownerId={highlight.user_id}
            username={owner?.username ?? 'them'}
            allowed={!!owner && !owner.is_blocked && (owner.story_replies === 'everyone' || (owner.story_replies === 'following' && owner.follows_me))}
            cover={coverOf(ctx.entry.item)}
            onFocus={ctx.pause}
            onBlur={ctx.resume}
          />
        )
      }
    />
  );
}
