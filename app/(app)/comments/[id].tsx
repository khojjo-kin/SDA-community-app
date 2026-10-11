import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOpen } from '../../../src/components/AssistiveButton';
import { Icon, VerifiedTick } from '../../../src/components/Icon';
import { useLegalSheet } from '../../../src/components/LegalDocument';
import { RowsSkeleton } from '../../../src/components/Skeleton';
import { Avatar, Empty, ErrorNote, useChoices, useToast } from '../../../src/components/ui';
import { addComment, deleteComment, fetchComments, fetchPost, report, setCommentLike } from '../../../src/lib/api';
import { explainCopyrightReport } from '../../../src/lib/copyright-report';
import { tap } from '../../../src/lib/haptics';
import { en, type Key, t } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { getPostNow, usePost } from '../../../src/lib/store';
import { ago, C, errText, fmt } from '../../../src/lib/theme';
import type { Comment } from '../../../src/lib/types';

const EMOJI = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

/** Why a comment can be reported. The English goes to the server, so admins read every report alike. */
const REPORT_REASONS: Key[] = ['report.spam', 'report.harassment', 'report.nudity', 'report.copyright', 'report.other'];

/** The small word buttons fade a little under the finger. */
const dim = ({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.55 : 1 });

/** A comment shows at once, with an id of this shape, until the server's own id comes back. */
const PENDING = 'pending-';
const isPending = (c: Comment) => c.id.startsWith(PENDING);

/** What a comment row can do, through the screen's latest handlers, so the object itself never changes. */
type CommentActions = { profile: (c: Comment) => void; reply: (c: Comment) => void; remove: (c: Comment) => void; report: (c: Comment) => void; like: (c: Comment) => void };

/** One comment. Memoised: the screen draws again on every key typed in the box below the list. */
const CommentRow = React.memo(function CommentRow({ c, canDelete, mine, actions }: { c: Comment; canDelete: boolean; mine: boolean; actions: CommentActions }) {
  const pending = isPending(c);
  // From someone the post's owner restricted: only the two of them see it. The owner sees it greyed,
  // labelled, to delete (or leave); it isn't answered in public. Only ever set for the owner.
  const restricted = !!c.restricted;
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Pressable onPress={() => actions.profile(c)} accessibilityLabel={`Open ${c.username}'s profile`} style={{ opacity: restricted ? 0.5 : 1 }}>
        <Avatar uri={c.avatar_url} name={c.full_name} size={36} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ color: restricted ? C.fg2 : C.fg, fontWeight: '600', fontSize: 13.5, flexShrink: 1 }}>{c.username}</Text>
          {c.verified ? <VerifiedTick size={12} /> : null}
          <Text style={{ color: C.fg2, fontSize: 12.5, marginLeft: 4 }}>{pending ? t('comments.posting') : ago(c.created_at)}</Text>
          {restricted ? (
            <View style={{ marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: C.surface }}>
              <Text style={{ color: C.fg2, fontSize: 11, fontWeight: '600' }}>{t('comments.restricted')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: restricted ? C.fg3 : C.fg, fontSize: 14.5, lineHeight: 20, marginTop: 1 }} selectable>{c.text}</Text>
        {pending ? null : (
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 5 }}>
            {restricted ? null : (
              <Pressable onPress={() => actions.reply(c)} hitSlop={6} accessibilityRole="button" style={dim}>
                <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Reply</Text>
              </Pressable>
            )}
            {canDelete ? (
              <Pressable onPress={() => actions.remove(c)} hitSlop={6} accessibilityRole="button" style={dim}>
                <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{t('common.delete')}</Text>
              </Pressable>
            ) : null}
            {!mine ? (
              <Pressable onPress={() => actions.report(c)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('report.commentTitle')} style={dim}>
                <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{t('report.report')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
      {pending ? (
        <View style={{ minWidth: 28 }} />
      ) : (
        <Pressable onPress={() => actions.like(c)} hitSlop={8} style={({ pressed }) => ({ alignItems: 'center', minWidth: 28, paddingTop: 4, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel={c.liked ? 'Unlike comment' : 'Like comment'}>
          <Icon name="heart" size={16} color={c.liked ? C.like : C.fg2} fill={c.liked} />
          {c.like_count ? <Text style={{ color: C.fg2, fontSize: 11.5, marginTop: 2, fontVariant: ['tabular-nums'] }}>{fmt(c.like_count)}</Text> : null}
        </Pressable>
      )}
    </View>
  );
});

const keyOfComment = (c: Comment) => c.id;
const LIST_STYLE = { flex: 1 };
const LIST_CONTENT = { paddingBottom: 8 };

export default function Comments() {
  // answer=1: opened from a prompt's Answer, so the box is ready to type in.
  const { id, answer } = useLocalSearchParams<{ id: string; answer?: string }>();
  const postId = String(id);
  const { me, profile } = useSession();
  const post = usePost(postId);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  // With the keyboard up the box sits on it, so the home indicator's gap below it goes.
  const keyboard = useKeyboardOpen();
  const [list, setList] = useState<Comment[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Comment>>(null);
  // The Copyright policy, offered after a copyright report.
  const legal = useLegalSheet();
  // The reasons for a report: an alert on iPhone, a sheet on Android (whose alerts hold only three buttons).
  const choices = useChoices();
  // Comments sent from here, kept through a reload that was fetched before the server had them.
  const sentHere = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      // Opened from a link or a notification: the post may not be loaded yet, or may be gone.
      if (!getPostNow(postId) && !(await fetchPost(postId))) {
        setStatus('missing');
        return;
      }
      const rows = await fetchComments(postId);
      // Comments still on their way (or only just arrived) stay at the end until the list has them.
      setList((cur) => {
        const have = new Set(rows.map((r) => r.id));
        return [...rows, ...cur.filter((c) => (isPending(c) || sentHere.current.has(c.id)) && !have.has(c.id))];
      });
      setStatus('ready');
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  // One tap, one screen: leaving twice would also close the screen underneath.
  const lastLeave = useRef(0);
  const leaving = () => {
    const now = Date.now();
    if (now - lastLeave.current < 700) return true;
    lastLeave.current = now;
    return false;
  };
  const close = () => {
    if (leaving()) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  /** Shows the comment at once and sends it; if the server says no, it goes and the words come back to the box. */
  async function send() {
    const body = text.trim();
    const p = post;
    if (!body || !p) return;
    tap('light');
    const temp: Comment = {
      id: `${PENDING}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      post_id: p.id,
      user_id: me,
      text: body,
      created_at: new Date().toISOString(),
      username: profile?.username ?? '',
      full_name: profile?.full_name ?? '',
      avatar_url: profile?.avatar_url ?? '',
      like_count: 0,
      liked: false,
      verified: !!profile?.verified,
    };
    setList((cur) => [...cur, temp]);
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const saved = await addComment(me, p, body);
      if (saved) {
        sentHere.current.add(saved.id);
        setList((cur) => (cur.some((c) => c.id === saved.id) ? cur.filter((c) => c.id !== temp.id) : cur.map((c) => (c.id === temp.id ? { ...c, id: saved.id, created_at: saved.created_at } : c))));
      } else {
        // Saved, but not readable back at once: the list fetched again has it.
        await load();
        setList((cur) => cur.filter((c) => c.id !== temp.id));
      }
    } catch (e) {
      setList((cur) => cur.filter((c) => c.id !== temp.id));
      // The words come back to the box, unless a new comment has been started there since.
      setText((cur) => (cur.trim() ? cur : body));
      toast(errText(e));
    }
  }

  function like(c: Comment) {
    if (isPending(c)) return;
    const next = !c.liked;
    if (next) tap('light');
    setList((cur) => cur.map((x) => (x.id === c.id ? { ...x, liked: next, like_count: Math.max(0, x.like_count + (next ? 1 : -1)) } : x)));
    setCommentLike(me, c.id, next).catch((e) => {
      toast(errText(e));
      load();
    });
  }

  function remove(c: Comment) {
    const p = post;
    if (!p || isPending(c)) return;
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Gone at once; the list comes back as the server has it if the delete fails.
          setList((cur) => cur.filter((x) => x.id !== c.id));
          deleteComment(p, c.id).catch((e) => {
            toast(errText(e));
            load();
          });
        },
      },
    ]);
  }

  function reportComment(c: Comment) {
    if (!post || isPending(c)) return;
    // A report has no place for a comment of its own, so the reason quotes it, within the 500 characters a reason may have.
    const file = (r: Key) => {
      const quote = c.text.replace(/\s+/g, ' ').trim().slice(0, 440);
      report(me, { postId: post.id, userId: c.user_id }, `${en[r]} (on a comment: "${quote}")`)
        // A copyright report also says how to send a formal notice.
        .then(() => (r === 'report.copyright' ? explainCopyrightReport().then((read) => { if (read) legal.open('copyright'); }) : toast(t('report.commentThanks'))))
        .catch((e) => toast(errText(e)));
    };
    // Cancel is added last, on both.
    choices.ask({ title: t('report.commentTitle'), message: t('report.why'), icon: 'flag', choices: REPORT_REASONS.map((r) => ({ label: t(r), onPress: () => file(r) })) });
  }

  // With comments turned off, only the author can add one.
  const closed = !!post?.comments_off && post.user_id !== me;
  const prompt = (post?.prompt ?? '').trim();

  // The rows reach the screen's handlers through this, so typing in the box doesn't draw every comment again.
  const latest = useRef<CommentActions>(null as unknown as CommentActions);
  latest.current = {
    profile: (c) => {
      if (leaving()) return;
      // Comments slide up over the post; the profile opens from where the post was.
      if (router.canGoBack()) {
        router.back();
        setTimeout(() => router.push(`/user/${c.user_id}`), 50);
      } else router.replace(`/user/${c.user_id}`);
    },
    reply: (c) => {
      // Their name goes first; anything already typed stays after it (a name put there by an earlier Reply is swapped).
      setText((cur) => `@${c.username} ${cur.replace(/^@\S+\s*/, '')}`);
      input.current?.focus();
    },
    remove,
    report: reportComment,
    like,
  };
  const actions = useMemo<CommentActions>(
    () => ({
      profile: (c) => latest.current.profile(c),
      reply: (c) => latest.current.reply(c),
      remove: (c) => latest.current.remove(c),
      report: (c) => latest.current.report(c),
      like: (c) => latest.current.like(c),
    }),
    [],
  );
  const author = post?.user_id;
  const renderComment = useCallback(
    ({ item: c }: { item: Comment }) => <CommentRow c={c} canDelete={c.user_id === me || author === me} mine={c.user_id === me} actions={actions} />,
    [me, author, actions],
  );
  const listHeader = useMemo(
    () =>
      prompt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, padding: 12, borderRadius: 14, backgroundColor: C.surface }}>
          <Icon name="chatdots" size={18} color={C.accent2} weight={2.1} />
          <Text style={{ flex: 1, color: C.fg, fontWeight: '600', lineHeight: 20 }}>{prompt}</Text>
        </View>
      ) : null,
    [prompt],
  );
  const listEmpty = useMemo(
    () =>
      status === 'loading' ? (
        <RowsSkeleton count={6} avatar={36} padY={10} />
      ) : status === 'error' ? (
        <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} />
      ) : status === 'missing' ? (
        <Empty icon="image" title={t('gridFeed.unavailable')} />
      ) : (
        <Empty icon="comment" title="No comments yet" />
      ),
    [status, error, load],
  );
  const canSend = !!text.trim() && !!post;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      <View style={{ height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
        <View style={{ width: 64 }} />
        <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 16.5, fontWeight: '700', textAlign: 'center' }}>Comments</Text>
        <Pressable onPress={close} hitSlop={8} style={({ pressed }) => ({ width: 64, alignItems: 'flex-end', opacity: pressed ? 0.6 : 1 })} accessibilityRole="button">
          <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 16, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={list}
        keyExtractor={keyOfComment}
        style={LIST_STYLE}
        contentContainerStyle={LIST_CONTENT}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={listHeader}
        renderItem={renderComment}
        ListEmptyComponent={listEmpty}
      />

      {status === 'missing' ? null : closed ? (
        <Text style={{ color: C.fg2, textAlign: 'center', paddingTop: 14, paddingBottom: insets.bottom + 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }}>{t('postExtras.commentsOff')}</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }}>
            {EMOJI.map((e) => (
              <Pressable key={e} onPress={() => setText((cur) => cur + e)} hitSlop={4} accessibilityLabel={`Add ${e}`} style={dim}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 4, paddingBottom: (keyboard ? 0 : insets.bottom) + 8 }}>
            <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={36} />
            <TextInput ref={input} autoFocus={answer === '1'} value={text} onChangeText={setText} placeholder={prompt && answer === '1' ? t('postExtras.answerPlaceholder') : t('live.commentPlaceholder')} placeholderTextColor={C.fg3} selectionColor={C.accent2} maxLength={2200} multiline keyboardAppearance={C.blurTint} style={{ flex: 1, color: C.fg, fontSize: 16, minHeight: 42, maxHeight: 110, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 21, borderWidth: 1, borderColor: C.surface2 }} accessibilityLabel={t('live.commentLabel')} />
            <Pressable onPress={send} disabled={!canSend} hitSlop={8} accessibilityRole="button" accessibilityState={{ disabled: !canSend }} style={({ pressed }) => ({ minWidth: 36, alignItems: 'center', opacity: pressed ? 0.55 : 1 })}>
              <Text style={{ color: C.accent2, fontSize: 15.5, fontWeight: '700', opacity: canSend ? 1 : 0.4 }}>Post</Text>
            </Pressable>
          </View>
        </>
      )}
      {choices.element}
      {legal.element}
    </KeyboardAvoidingView>
  );
}
