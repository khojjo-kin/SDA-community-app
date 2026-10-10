import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { profilesInOrder, votePoll } from '../lib/api';
import { tap } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import type { Post, Profile } from '../lib/types';
import { Icon } from './Icon';
import { Avatar, Loading, Sheet, useToast } from './ui';

/*
 * What a post can carry besides its media and caption: an AI label, tagged people, a prompt others
 * answer, and a poll. Shared by the feed's PostCard and the Shorts player.
 */

/** "AI info": the author says it was made or changed with AI. */
export function AiInfo({ dark }: { dark?: boolean }) {
  const t = useT();
  return (
    <View accessibilityLabel={t('postExtras.aiInfo')} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name="sparkle" size={12} color={dark ? 'rgba(255,255,255,0.85)' : C.fg2} weight={2.2} />
      <Text style={{ color: dark ? 'rgba(255,255,255,0.85)' : C.fg2, fontSize: 12, fontWeight: '600' }}>{t('postExtras.aiInfo')}</Text>
    </View>
  );
}

/* ---------- tagged people ---------- */

// Who has been looked up already, so a post scrolling past again doesn't ask again.
const known = new Map<string, Profile>();

/** The tagged people's profiles, in tag order (accounts I can't see are left out). Loaded when `on`. */
function useTagged(ids: string[], on: boolean): Profile[] | null {
  const key = ids.join(',');
  const [people, setPeople] = useState<Profile[] | null>(() => (ids.every((id) => known.has(id)) ? ids.map((id) => known.get(id)!) : null));
  useEffect(() => {
    if (!on || !key) return;
    const list = key.split(',');
    const missing = list.filter((id) => !known.has(id));
    if (!missing.length) {
      setPeople(list.map((id) => known.get(id)!).filter(Boolean));
      return;
    }
    let live = true;
    profilesInOrder(missing)
      .then((found) => {
        found.forEach((p) => known.set(p.id, p));
        if (live) setPeople(list.map((id) => known.get(id)).filter(Boolean) as Profile[]);
      })
      .catch(() => {
        if (live) setPeople([]);
      });
    return () => {
      live = false;
    };
  }, [key, on]);
  return people;
}

/** The people tagged in a post; tapping one opens their profile. */
function TaggedSheet({ ids, visible, onClose }: { ids: string[]; visible: boolean; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const people = useTagged(ids, visible);
  return (
    <Sheet visible={visible} onClose={onClose} title={t('postExtras.inThisPost')}>
      {people === null ? (
        <Loading />
      ) : (
        <ScrollView style={{ maxHeight: 420 }}>
          {people.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                onClose();
                setTimeout(() => router.push(`/user/${p.id}`), 250);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.openProfile', { username: p.username })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
              <Avatar uri={p.avatar_url} name={p.full_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.username}</Text>
                {p.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text> : null}
              </View>
              <Icon name="right" size={17} color={C.fg2} weight={2.2} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

/** The round person button on a post's photo: shows who is tagged. `top` keeps it clear of a video's own buttons along the bottom. */
export function TagsButton({ ids, top }: { ids: string[]; top?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('postExtras.seeTagged')} style={({ pressed }) => ({ position: 'absolute', left: 10, ...(top ? { top: 10 } : { bottom: 10 }), width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(10,12,14,0.72)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Icon name="user" size={16} color="#fff" weight={2.2} />
      </Pressable>
      <TaggedSheet ids={ids} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** "with @mary and 2 others", for Shorts. One person opens their profile; more open the list. */
export function TaggedLine({ ids }: { ids: string[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const people = useTagged(ids, true);
  const first = people?.[0];
  if (!first) return null;
  const others = people.length - 1;
  const words = others ? t(others === 1 ? 'postExtras.withOneOther' : 'postExtras.withOthers', { username: first.username, count: others }) : t('postExtras.withOne', { username: first.username });
  return (
    <>
      <Pressable onPress={() => (others ? setOpen(true) : router.push(`/user/${first.id}`))} hitSlop={6} accessibilityRole="button" accessibilityLabel={words} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}>
        <Icon name="user" size={13} color="#fff" weight={2.3} />
        <Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{words}</Text>
      </Pressable>
      <TaggedSheet ids={ids} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ---------- prompt ---------- */

/** One tap, one screen: a quick second tap on Answer doesn't open the comments twice. */
let lastAnswer = 0;

/**
 * The author's question, with Answer (opens the comments with the box ready). Without Answer when
 * comments are off for me.
 */
export function PromptCard({ post, dark }: { post: Post; dark?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { me } = useSession();
  const text = (post.prompt ?? '').trim();
  if (!text) return null;
  const canAnswer = !post.comments_off || post.user_id === me;
  const fg = dark ? '#fff' : C.fg;
  const answer = () => {
    const now = Date.now();
    if (now - lastAnswer < 600) return;
    lastAnswer = now;
    router.push({ pathname: '/comments/[id]', params: { id: post.id, answer: '1' } } as any);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: dark ? 0 : 12, marginTop: dark ? 8 : 10, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, minHeight: 46, borderRadius: 14, backgroundColor: dark ? 'rgba(0,0,0,0.45)' : C.surface }}>
      <Icon name="chatdots" size={18} color={dark ? '#fff' : C.accent2} weight={2.1} />
      <Text numberOfLines={2} style={{ flex: 1, color: fg, fontWeight: '600', fontSize: 14, lineHeight: 19 }}>{text}</Text>
      {canAnswer ? (
        <Pressable onPress={answer} accessibilityRole="button" accessibilityLabel={t('postExtras.answer')} style={({ pressed }) => ({ height: 32, paddingHorizontal: 13, borderRadius: 16, backgroundColor: C.accent, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
          <Text style={{ color: C.onAccent, fontWeight: '700', fontSize: 13.5 }}>{t('postExtras.answer')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------- poll ---------- */

/**
 * The options as rows. Before voting they are plain choices; after, each shows its share as a bar,
 * mine marked. Tapping another option moves my vote; tapping mine takes it back.
 */
export function PollCard({ post }: { post: Post }) {
  const t = useT();
  const toast = useToast();
  const { me } = useSession();
  const poll = post.poll;
  if (!poll || !Array.isArray(poll.options) || poll.options.length < 2) return null;
  const counts = poll.options.map((_, i) => Math.max(0, post.poll_counts?.[i] ?? 0));
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = typeof post.my_vote === 'number' ? post.my_vote : null;
  const voted = mine !== null;
  // The author sees how it is going without voting.
  const results = voted || post.user_id === me;

  function vote(i: number) {
    tap('select');
    votePoll(me, post, mine === i ? null : i).catch((e) => toast(errText(e)));
  }

  return (
    <View style={{ marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: C.surface, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Icon name="poll" size={16} color={C.accent2} weight={2.1} />
        <Text style={{ flex: 1, color: C.fg, fontWeight: '700', fontSize: 14.5 }} numberOfLines={3}>{poll.question?.trim() || t('postExtras.poll')}</Text>
      </View>
      {poll.options.map((o, i) => {
        const share = total ? Math.round((counts[i] / total) * 100) : 0;
        const on = mine === i;
        return (
          <Pressable
            key={i}
            onPress={() => vote(i)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={results ? t('postExtras.optionResult', { option: o, percent: share }) : o}
            style={({ pressed }) => ({ minHeight: 42, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', backgroundColor: results ? C.bg2 : C.surface2, borderWidth: on ? 1.5 : 0, borderColor: C.accent2, opacity: pressed ? 0.75 : 1 })}>
            {results ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${share}%`, backgroundColor: on ? C.accentSoft : C.surface2 }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}>
              <Text style={{ flex: 1, color: C.fg, fontWeight: on ? '700' : '500', fontSize: 14.5 }} numberOfLines={2}>{o}</Text>
              {on ? <Icon name="check" size={16} color={C.accent2} weight={2.6} /> : null}
              {results ? <Text style={{ color: on ? C.accent2 : C.fg2, fontWeight: '700', fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{share}%</Text> : null}
            </View>
          </Pressable>
        );
      })}
      {results ? <Text style={{ color: C.fg2, fontSize: 12.5 }}>{t(total === 1 ? 'postExtras.votesOne' : 'postExtras.votes', { count: total })}</Text> : null}
    </View>
  );
}

/** On a short: the poll as one line that opens the post, where it can be voted on. */
export function PollPill({ post }: { post: Post }) {
  const t = useT();
  const router = useRouter();
  if (!post.poll || !Array.isArray(post.poll.options) || post.poll.options.length < 2) return null;
  const label = post.poll.question?.trim() || t('postExtras.poll');
  return (
    <Pressable onPress={() => router.push(`/post/${post.id}`)} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 8, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', opacity: pressed ? 0.7 : 1 })}>
      <Icon name="poll" size={15} color="#fff" weight={2.1} />
      <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '600', fontSize: 13.5, flexShrink: 1 }}>{label}</Text>
      <Icon name="right" size={14} color="#fff" weight={2.4} />
    </Pressable>
  );
}
