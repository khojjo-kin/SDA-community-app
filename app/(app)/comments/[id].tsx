import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../../src/components/Icon';
import { Avatar, Empty, ErrorNote, Loading, useToast } from '../../../src/components/ui';
import { addComment, deleteComment, fetchComments, fetchPost, setCommentLike } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { ago, C, errText, fmt } from '../../../src/lib/theme';
import type { Comment } from '../../../src/lib/types';

const EMOJI = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

export default function Comments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const { me, profile } = useSession();
  const post = usePost(postId);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Comment[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Comment>>(null);

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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ width: 60 }} />
        <Text style={{ flex: 1, color: C.fg, fontWeight: '700', textAlign: 'center' }}>Comments</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 60, alignItems: 'flex-end' }} accessibilityRole="button">
          <Text style={{ color: C.accent2, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={list}
        keyExtractor={(c) => c.id}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: c }) => {
          const canDelete = c.user_id === me || post?.user_id === me;
          return (
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Pressable onPress={() => { router.back(); setTimeout(() => router.push(`/user/${c.user_id}`), 50); }} accessibilityLabel={`Open ${c.username}'s profile`}>
                <Avatar uri={c.avatar_url} name={c.full_name} size={36} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg2, fontSize: 12.5 }}>
                  <Text style={{ color: C.fg, fontWeight: '600', fontSize: 13.5 }}>{c.username}</Text>  {ago(c.created_at)}
                </Text>
                <Text style={{ color: C.fg, lineHeight: 20 }} selectable>{c.text}</Text>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                  <Pressable onPress={() => { setText(`@${c.username} `); input.current?.focus(); }} hitSlop={6}>
                    <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Reply</Text>
                  </Pressable>
                  {canDelete ? (
                    <Pressable onPress={() => remove(c)} hitSlop={6}>
                      <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={() => like(c)} hitSlop={8} style={{ alignItems: 'center', minWidth: 28, paddingTop: 4 }} accessibilityRole="button" accessibilityLabel={c.liked ? 'Unlike comment' : 'Like comment'}>
                <Icon name="heart" size={16} color={c.liked ? C.like : C.fg2} fill={c.liked} />
                {c.like_count ? <Text style={{ color: C.fg2, fontSize: 11.5 }}>{fmt(c.like_count)}</Text> : null}
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={status === 'loading' ? <Loading /> : status === 'error' ? <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(); }} /> : <Empty title="No comments yet" body="Start the conversation." />}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
        {EMOJI.map((e) => (
          <Pressable key={e} onPress={() => setText((t) => t + e)} hitSlop={4} accessibilityLabel={`Add ${e}`}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 4, paddingBottom: insets.bottom + 8 }}>
        <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={36} />
        <TextInput ref={input} value={text} onChangeText={setText} placeholder={post ? `Add a comment for ${post.username}…` : 'Add a comment…'} placeholderTextColor={C.fg3} maxLength={2200} multiline keyboardAppearance="dark" style={{ flex: 1, color: C.fg, fontSize: 16, minHeight: 42, maxHeight: 110, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 21, borderWidth: 1, borderColor: C.surface2 }} accessibilityLabel="Comment" />
        <Pressable onPress={send} disabled={!text.trim() || sending} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: C.accent2, fontWeight: '600', opacity: !text.trim() || sending ? 0.4 : 1 }}>Post</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
