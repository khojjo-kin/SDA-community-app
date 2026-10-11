// expo-audio on the computer. The shared call code sets the phone's audio session before a call;
// a browser has no audio session to set, so that does nothing here. The desktop's own player
// (ui/player.tsx) plays Pod, so the phone player hooks are never used.
export async function setAudioModeAsync(_mode: Record<string, unknown>): Promise<void> {}

export function useAudioPlayer(): null {
  return null;
}

export function useAudioPlayerStatus(): { playing: boolean; currentTime: number; duration: number } {
  return { playing: false, currentTime: 0, duration: 0 };
}
