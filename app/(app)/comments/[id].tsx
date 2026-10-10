import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOpen } from '../../../src/components/AssistiveButton';
import { Icon } from '../../../src/components/Icon';
import { useLegalSheet } from '../../../src/components/LegalDocument';
import { Avatar, Empty, ErrorNote, Loading, useChoices, useToast } from '../../../src/components/ui';
import { addComment, deleteComment, fetchComments, fetchPost, report, setCommentLike } from '../../../src/lib/api';
import { explainCopyrightReport } from '../../../src/lib/copyright-report';
import { en, type Key, t } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { ago, C, errText, fmt } from '../../../src/lib/theme';
import type { Comment } from '../../../src/lib/types';

const EMOJI = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

/** Why a comment can be reported. The English goes to the server, so admins read every report alike. */
const REPORT_REASONS: Key[] = ['report.spam', 'report.harassment', 'report.nudity', 'report.copyright', 'report.other'];

/** The small word buttons fade a little under the finger. */
const dim = ({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.55 : 1 });

/** What a comment row can do, through the screen's latest handlers, so the object itself never changes. */
type CommentActions = { profile: (c: Comment) => void; reply: (c: Comment) => void; remove: (c: Comment) => void; report: (c: Comment) => void; like: (c: Comment) => void };

/** One comment. Memoised: the screen draws again on every key typed in the box below the list. */
const CommentRow = React.memo(function CommentRow({ c, canDelete, mine, actions }: { c: Comment; canDelete: boolean; mine: boolean; actions: CommentActions }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Pressable onPress={() => actions.profile(c)} accessibilityLabel={`Open ${c.username}'s profile`}>
        <Avatar uri={c.avatar_url} name={c.full_name} size={36} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.fg2, fontSize: 12.5 }}>
          <Text style={{ color: C.fg, fontWeight: '600', fontSize: 13.5 }}>{c.username}</Text>  {ago(c.created_at)}
        </Text>
        <Text style={{ color: C.fg, lineHeight: 20 }} selectable>{c.text}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          <Pressable onPress={() => actions.reply(c)} hitSlop={6} accessibilityRole="button" style={dim}>
            <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Reply</Text>
          </Pressable>
          {canDelete ? (
            <Pressable onPress={() => actions.remove(c)} hitSlop={6} accessibilityRole="button" style={dim}>
              <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Delete</Text>
            </Pressable>
          ) : null}
          {!mine ? (
            <Pressable onPress={() => actions.report(c)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('report.commentTitle')} style={dim}>
              <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{t('report.report')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Pressable onPress={() => actions.like(c)} hitSlop={8} style={({ pressed }) => ({ alignItems: 'center', minWidth: 28, paddingTop: 4, opacity: pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel={c.liked ? 'Unlike comment' : 'Like comment'}>
        <Icon name="heart" size={16} color={c.liked ? C.like : C.fg2} fill={c.liked} />
        {c.like_count ? <Text style={{ color: C.fg2, fontSize: 11.5 }}>{fmt(c.like_count)}</Text> : null}
      </Pressable>
    </View>
  );
});

const keyOfComment = (c: Comment) => c.id;
const LIST_STYLE = { flex: 1 };

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Comment>>(null);
  // The Copyright policy, offered after a copyright report.
  const legal = useLegalSheet();
  // The reasons for a report: an alert on iPhone, a sheet on Android (whose alerts hold only three buttons).
  const choices = useChoices();

  const load = useCallback(async () => {
    try {
      if (!post) await fetchPost(postId);
      setList(await fetchComments(postId));
      setStatus('ready');
    } catch (e) {
      setError(errText(e));
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const body = text.trim();
    if (!body || sending || !post) return;
    setSending(true);
    try {
      await addComment(me, post, body);
      setText('');
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  function like(c: Comment) {
    const next = !c.liked;
    setList((cur) => cur.map((x) => (x.id === c.id ? { ...x, liked: next, like_count: Math.max(0, x.like_count + (next ? 1 : -1)) } : x)));
    setCommentLike(me, c.id, next).catch((e) => {
      toast(errText(e));
      load();
    });
  }

  function remove(c: Comment) {
    if (!post) return;
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteComment(post, c.id).then(load).catch((e) => toast(errText(e))); } },
    ]);
  }

  function reportComment(c: Comment) {
    if (!post) return;
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
    profile: (c) => { router.back(); setTimeout(() => router.push(`/user/${c.user_id}`), 50); },
    reply: (c) => { setText(`@${c.username} `); input.current?.focus(); },
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
    () => (status === 'loading' ? <Loading /> : status === 'error' ? <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} /> : <Empty title="No comments yet" body="Start the conversation." />),
    [status, error, load],
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ width: 60 }} />
        <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontWeight: '700', textAlign: 'center' }}>Comments</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => ({ width: 60, alignItems: 'flex-end', opacity: pressed ? 0.6 : 1 })} accessibilityRole="button">
          <Text numberOfLines={1} style={{ color: C.accent2, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={list}
        keyExtractor={keyOfComment}
        style={LIST_STYLE}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        renderItem={renderComment}
        ListEmptyComponent={listEmpty}
      />

      {closed ? (
        <Text style={{ color: C.fg2, textAlign: 'center', paddingTop: 14, paddingBottom: insets.bottom + 14, borderTopWidth: 1, borderTopColor: C.line }}>{t('postExtras.commentsOff')}</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
            {EMOJI.map((e) => (
              <Pressable key={e} onPress={() => setText((t) => t + e)} hitSlop={4} accessibilityLabel={`Add ${e}`} style={dim}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 4, paddingBottom: (keyboard ? 0 : insets.bottom) + 8 }}>
            <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={36} />
            <TextInput ref={input} autoFocus={answer === '1'} value={text} onChangeText={setText} placeholder={prompt && answer === '1' ? t('postExtras.answerPlaceholder') : t('live.commentPlaceholder')} placeholderTextColor={C.fg3} maxLength={2200} multiline keyboardAppearance={C.blurTint} style={{ flex: 1, color: C.fg, fontSize: 16, minHeight: 42, maxHeight: 110, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 21, borderWidth: 1, borderColor: C.surface2 }} accessibilityLabel={t('live.commentLabel')} />
            <Pressable onPress={send} disabled={!text.trim() || sending} hitSlop={8} accessibilityRole="button" style={dim}>
              <Text style={{ color: C.accent2, fontWeight: '600', opacity: !text.trim() || sending ? 0.4 : 1 }}>Post</Text>
            </Pressable>
          </View>
        </>
      )}
      {choices.element}
      {legal.element}
    </KeyboardAvoidingView>
  );
}
