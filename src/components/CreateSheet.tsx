import React from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '../lib/session';
import { Sheet, SheetRow } from './ui';

/** The "Create" sheet behind every + button. */
export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { profile } = useSession();
  const go = (path: string) => () => {
    onClose();
    // Let the sheet finish sliding away before the next screen arrives.
    setTimeout(() => router.push(path as any), 220);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Create">
      {/* One way in for photos and videos: a video shared on its own becomes a clip. */}
      <SheetRow first icon="grid" label="Post" sub="Photos, videos and shorts" onPress={go('/create?mode=post')} />
      <SheetRow icon="story" label="Story" onPress={go('/add-story')} />
      {/* Members under 14 can't broadcast. */}
      {profile?.restricted !== true ? <SheetRow icon="live" label="Live" sub="Broadcast to everyone, right now" onPress={go('/go-live')} /> : null}
      <SheetRow icon="highlight" label="Memory" onPress={go('/new-highlight')} />
    </Sheet>
  );
}
