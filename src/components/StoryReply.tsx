import React, { useRef, useState } from 'react';
import { Animated, Text, TextInput, View } from 'react-native';
import { openThread, sendMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { DARK, errText } from '../lib/theme';
import { IconButton, useToast } from './ui';

/**
 * The bar under someone else's story or highlight: a "Say something…" box, a heart and a send
 * button. Replies and hearts arrive in their messages, with the story's picture attached.
 * The story itself is black in every theme, so this bar is drawn in white on black too.
 */
export function StoryReply({ ownerId, username, allowed, cover, onFocus, onBlur }: { ownerId: string; username: string; allowed: boolean; cover?: string; onFocus: () => void; onBlur: () => void }) {
  const { me } = useSession();
  const toast = useToast();
  const input = useRef<TextInput>(null);
  const pop = useRef(new Animated.Value(1)).current;
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
      if (!heart) {
        setText('');
        input.current?.blur();
      }
      toast(heart ? 'Sent' : 'Reply sent');
    } catch (e) {
      if (heart) setLiked(false);
      toast(errText(e));
    } finally {
      setSending(false);
    }
  }

  function like() {
    if (liked) return;
    // A quick swell and settle, so the heart feels sent before the message has gone.
    pop.setValue(1);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1.4, speed: 40, bounciness: 12, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }),
    ]).start();
    send('❤️', true);
  }

  if (!allowed) {
    return (
      <View style={{ height: 46, justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', fontSize: 14.5 }} accessibilityLabel={`${username} has turned off replies`}>
          Replies are off
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 6 }}>
      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={() => send(text)}
        returnKeyType="send"
        placeholder="Say something…"
        placeholderTextColor="rgba(255,255,255,0.72)"
        maxLength={300}
        keyboardAppearance="dark"
        selectionColor="#fff"
        style={{ flex: 1, height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)', color: '#fff', fontSize: 15.5 }}
        accessibilityLabel={`Reply to ${username}`}
      />
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <IconButton name="heart" label={liked ? 'Heart sent' : 'Send a heart'} size={27} color={liked ? DARK.like : '#fff'} fill={liked} onPress={like} />
      </Animated.View>
      {/* With nothing written yet, the paper plane opens the keyboard rather than doing nothing. */}
      <IconButton name="send" label="Send reply" size={25} color={sending ? 'rgba(255,255,255,0.45)' : '#fff'} onPress={() => (text.trim() ? send(text) : input.current?.focus())} />
    </View>
  );
}
