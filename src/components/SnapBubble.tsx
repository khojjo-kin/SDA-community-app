import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppFont } from '../lib/fonts';
import { useT } from '../lib/i18n';
import { C } from '../lib/theme';
import { IconButton } from './ui';

/*
 * View-once photos in a chat. The photo itself is never drawn in the conversation: the chat shows a
 * small bubble instead, and the person it was sent to opens it once in a full-screen viewer. Only
 * then does the server hand over its address (openViewOnce), and it deletes the file soon after.
 */

/** The view-once mark, our own: a "1" sitting in a ring. */
export function OnceMark({ size = 22, color, weight = 1.6 }: { size?: number; color: string; weight?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: weight, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text allowFontScaling={false} style={{ color, fontSize: size * 0.56, lineHeight: size * 0.7, fontWeight: '800', textAlign: 'center' }}>1</Text>
    </View>
  );
}

/** The round "1" button beside photos waiting to be sent. On: each photo can be opened once. */
export function OnceToggle({ on, onPress, disabled }: { on: boolean; onPress: () => void; disabled?: boolean }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityLabel={t('snap.viewOnce')}
      accessibilityHint={t('snap.viewOnceHint')}
      accessibilityState={{ checked: on, disabled: !!disabled }}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: on ? C.accent : C.surface2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
      <OnceMark size={22} color={on ? C.onAccent : C.fg2} weight={on ? 2 : 1.6} />
    </Pressable>
  );
}

/** The little square in the bubble: filled while there is a photo waiting for you, outlined otherwise. */
function SnapSquare({ filled, color }: { filled: boolean; color: string }) {
  if (filled) {
    return (
      <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text allowFontScaling={false} style={{ color: C.onAccent, fontSize: 12.5, fontWeight: '800' }}>1</Text>
      </View>
    );
  }
  return <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: color }} />;
}

/**
 * A view-once photo in the chat.
 * - Sent to you, not opened yet: a filled square, "Photo", "Tap to view".
 * - Sent to you and opened: an outlined square, "Opened".
 * - Sent by you: "Delivered" until they open it, then "Opened". You can't open your own.
 */
export function SnapBubble({ mine, opened, onOpen }: { mine: boolean; opened: boolean; onOpen?: () => void }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const t = useT();
  const waiting = !mine && !opened;
  const status = t(waiting ? 'snap.tapToView' : opened ? 'snap.opened' : 'snap.delivered');
  const squareColor = opened ? C.fg3 : C.accent2;
  return (
    <Pressable
      onPress={waiting ? onOpen : undefined}
      disabled={!waiting || !onOpen}
      accessibilityRole={waiting ? 'button' : undefined}
      accessibilityLabel={t('snap.bubbleLabel', { status })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingLeft: 12,
        paddingRight: 18,
        paddingVertical: 10,
        borderRadius: 20,
        // Yours is outlined in the app's green rather than filled, so it reads as a status, not a message to open.
        backgroundColor: mine ? C.surface : C.surface2,
        borderWidth: mine ? 1.5 : 0,
        borderColor: C.accent,
        opacity: pressed ? 0.7 : 1,
      })}>
      <SnapSquare filled={waiting} color={squareColor} />
      <View>
        <Text style={{ color: C.fg, fontSize: 15.5, fontWeight: '600', fontFamily: font }}>{t('snap.photo')}</Text>
        <Text style={{ color: waiting ? C.accent2 : C.fg2, fontSize: 13, marginTop: 1, fontWeight: waiting ? '700' : '400', fontFamily: waiting ? fontBold : font }}>{status}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The full-screen viewer for a view-once photo. Always black, whatever the theme. The photo counts
 * as opened from the moment the server handed over its address; the address lives only in the
 * parent's state while this is open, and the image isn't kept in the phone's cache.
 */
export function SnapViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');
  // Bumped by "Try again", which loads the same photo afresh.
  const [attempt, setAttempt] = useState(0);

  // A new photo starts fresh.
  useEffect(() => {
    setState('loading');
    setAttempt(0);
  }, [url]);

  function loaded() {
    setState('shown');
  }

  return (
    <Modal visible={!!url} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {url ? (
          <>
            {/* Light clock and battery over the black, even on the White theme; gone again with the viewer. */}
            <StatusBar style="light" />
            <Image key={attempt} source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" cachePolicy="none" onLoad={loaded} onError={() => setState('failed')} accessibilityLabel={t('snap.viewOncePhoto')} />
            {state === 'loading' ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
            {state === 'failed' ? (
              <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 32, right: 32, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{t('snap.didNotLoad')}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{t('snap.didNotLoadBody')}</Text>
                <Pressable
                  onPress={() => {
                    setState('loading');
                    setAttempt((n) => n + 1);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.tryAgain')}</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12 }}>
              {/* The thin bar says this is a one-time look: it fills once the photo is showing. */}
              <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' }}>
                <View style={{ height: 3, width: state === 'shown' ? '100%' : '0%', backgroundColor: '#fff' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <OnceMark size={22} color="#fff" />
                <Text style={{ flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('snap.viewOnce')}</Text>
                <IconButton name="close" size={28} color="#fff" label={t('common.close')} onPress={onClose} />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
