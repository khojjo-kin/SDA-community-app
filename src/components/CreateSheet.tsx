import React from 'react';
import { useRouter } from 'expo-router';
import { Sheet, SheetRow } from './ui';

/** The "Create" sheet behind every + button. */
export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const go = (path: string) => () => {
    onClose();
    // Let the sheet finish sliding away before the next screen arrives.
    setTimeout(() => router.push(path as any), 220);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Create">
      <SheetRow first icon="reels" label="Reel" onPress={go('/create?mode=reel')} />
      <SheetRow icon="grid" label="Post" onPress={go('/create?mode=post')} />
      <SheetRow icon="story" label="Story" onPress={go('/add-story')} />
      <SheetRow icon="highlight" label="Highlight" onPress={go('/new-highlight')} />
    </Sheet>
  );
}
