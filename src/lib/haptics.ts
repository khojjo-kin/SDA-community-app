import * as Haptics from 'expo-haptics';
import { getPrefs } from './prefs';

/*
 * The small taps felt under the finger, like other social apps have: a light one on ordinary
 * buttons, a firmer one for likes and switches, and a success or warning buzz. Members can turn
 * them off in Settings (prefs.haptics).
 */
export type TapKind = 'light' | 'medium' | 'select' | 'success' | 'warning';

export function tap(kind: TapKind = 'light') {
  if (!getPrefs().haptics) return;
  try {
    if (kind === 'select') Haptics.selectionAsync().catch(() => {});
    else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // No haptics engine (simulator, older phone): nothing to feel.
  }
}
