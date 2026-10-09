import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { openThread, sendMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import { IconButton, useToast } from './ui';

/**
 * The box under someone else's story or highlight: write a reply, or send a heart.
 * Replies arrive in their messages, with the story's picture attached.
 */
export function StoryReply({ ownerId, username, allowed, cover, onFocus, onBlur }: { ownerId: string; username: string; allowed: boolean; cover?: string; onFocus: () => void; onBlur: () => void }) {
  const { me } = useSession();
  const toast = useToast();
  const [text, setText] = useState('');
  const [liked, setLiked] = useState(false);
  const [sending, setSending] = useState(false);

  async function send(body: string, heart = false) {
    if (!body.trim() || sending) return;
    setSending(true);
    if (heart) setLiked(true);
    try {
      const tid = await openThread(ownerId);
      await sendMessage(me, tid, { text: body, media_url: cover || undefined });
      if (!heart) setText('');
      toast(heart ? 'Sent' : 'Reply sent');
    } catch (e) {
      if (heart) setLiked(false);
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  if (!allowed) {
    return <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingVertical: 13 }}>{username} has turned off replies</Text>;
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 }}>
      <TextInput value={text} onChangeText={setText} onFocus={onFocus} onBlur={onBlur} onSubmitEditing={() => send(text)} returnKeyType="send" placeholder={`Reply to ${username}…`} placeholderTextColor="rgba(255,255,255,0.8)" maxLength={300} keyboardAppearance="dark" style={{ flex: 1, height: 46, paddingHorizontal: 18, borderRadius: 23, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', color: '#fff', fontSize: 16 }} accessibilityLabel={`Reply to ${username}`} />
      <IconButton name="heart" label="Send a heart" size={28} color={liked ? C.like : '#fff'} fill={liked} onPress={() => { if (!liked) send('❤️', true); }} />
      <IconButton name="send" label="Send reply" size={26} color="#fff" onPress={() => send(text)} />
    </View>
  );
}
