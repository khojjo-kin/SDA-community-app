import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { C } from '../lib/theme';
import { Avatar } from './ui';

/** The red colour of everything live: rings, pills, the end button. */
export const LIVE_RED = '#ff2d55';

/** The red "LIVE" pill. `small` is the one that sits under a story circle. */
export function LiveBadge({ small, style, label = 'LIVE' }: { small?: boolean; style?: ViewStyle; label?: string }) {
  return (
    <View accessibilityLabel="Live" style={[{ height: small ? 17 : 24, paddingHorizontal: small ? 6 : 9, borderRadius: small ? 5 : 7, backgroundColor: LIVE_RED, alignItems: 'center', justifyContent: 'center', borderWidth: small ? 2 : 0, borderColor: C.bg }, style]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: small ? 9.5 : 12, letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

/** A story-tray circle for someone broadcasting: their avatar in a red ring with the LIVE pill over the bottom edge. */
export function LiveAvatar({ uri, name, size = 66 }: { uri?: string | null; name?: string; size?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ padding: 2.5, borderRadius: size, borderWidth: 2.5, borderColor: LIVE_RED }}>
        <View style={{ borderRadius: size, borderWidth: 2.5, borderColor: C.bg }}>
          <Avatar uri={uri} name={name} size={size - 5} />
        </View>
      </View>
      <View style={{ position: 'absolute', bottom: -6 }}>
        <LiveBadge small />
      </View>
    </View>
  );
}
