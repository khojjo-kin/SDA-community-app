import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BUBBLE } from '../lib/theme';
import { Icon } from './Icon';

/** Erha's face: a spark on the app's green. */
export function ErhaAvatar({ size = 44 }: { size?: number }) {
  return (
    <LinearGradient colors={[BUBBLE[0], BUBBLE[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="sparkle" size={size * 0.52} color="#fff" weight={2} />
    </LinearGradient>
  );
}
