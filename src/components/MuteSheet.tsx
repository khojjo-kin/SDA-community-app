import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { getProfile, setMute } from '../lib/api';
import { tap } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { patchAuthor } from '../lib/store';
import { C, errText } from '../lib/theme';
import { Icon, IconName } from './Icon';
import { Sheet, Toggle, useToast } from './ui';

/** What is muted of one person: their posts, their stories, or both (both off is not muted). */
export type Muted = { posts: boolean; stories: boolean };

const ROWS: { key: keyof Muted; icon: IconName }[] = [
  { key: 'posts', icon: 'grid' },
  { key: 'stories', icon: 'story' },
];

/**
 * Mute, as on Instagram: a switch for someone's posts and one for their stories, each saved as it is
 * flipped (both off unmutes). Muted posts leave the feeds and muted stories the tray; their profile
 * still shows both, and they aren't told. `current` is what the screen already knows (their profile
 * card); without it the sheet asks the server as it opens.
 */
export function MuteSheet({ visible, onClose, userId, username, current, onChange }: { visible: boolean; onClose: () => void; userId: string; username: string; current?: Muted | null; onChange?: (next: Muted) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const t = useT();
  const [muted, setMuted] = useState<Muted | null>(current ?? null);
  // Read as the sheet opens, so a screen handing over a new object on every draw doesn't reset the switches.
  const currentRef = useRef(current);
  currentRef.current = current;
  const handlers = useRef({ onChange, onClose });
  handlers.current = { onChange, onClose };
  // How it was when the sheet opened, and how it is now: closing says what changed.
  const opened = useRef<Muted | null>(null);
  const latest = useRef<Muted | null>(null);
  // Saves go one after another, so quick flips reach the server in the order they were made.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const known = currentRef.current;
    if (known) {
      setMuted(known);
      opened.current = known;
      latest.current = known;
      return;
    }
    setMuted(null);
    opened.current = null;
    latest.current = null;
    getProfile(userId)
      .then((p) => {
        if (!live) return;
        const now = { posts: !!p?.muted_posts, stories: !!p?.muted_stories };
        setMuted(now);
        opened.current = now;
        latest.current = now;
      })
      .catch((e) => {
        if (!live) return;
        toast(errText(e));
        handlers.current.onClose();
      });
    return () => {
      live = false;
    };
  }, [visible, userId, toast]);

  function set(key: keyof Muted, value: boolean) {
    if (!muted) return;
    const next = { ...muted, [key]: value };
    setMuted(next);
    latest.current = next;
    handlers.current.onChange?.(next);
    queue.current = queue.current
      .then(() => setMute(me, userId, next))
      .catch(async (e) => {
        toast(errText(e));
        // Show what the server really has rather than guessing which change failed.
        try {
          const p = await getProfile(userId);
          const truth = { posts: !!p?.muted_posts, stories: !!p?.muted_stories };
          setMuted(truth);
          latest.current = truth;
          handlers.current.onChange?.(truth);
        } catch {
          // Still offline: the profile loads again later and sorts it out.
        }
      });
  }

  /** On closing: the cards already on screen follow the change, and a word says what it was. */
  function close() {
    const was = opened.current;
    const now = latest.current;
    if (was && now && (was.posts !== now.posts || was.stories !== now.stories)) {
      // Home leaves out the posts of people whose posts are muted (src/components/PostCard.tsx).
      if (was.posts !== now.posts) patchAuthor(userId, { author_muted: now.posts });
      toast(now.posts || now.stories ? t('mute.muted', { username }) : t('mute.unmuted', { username }));
    }
    opened.current = now;
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={close} title={t('mute.mute')}>
      {muted ? (
        ROWS.map((r) => {
          const label = t(r.key === 'posts' ? 'profile.alertsPosts' : 'profile.alertsStories');
          const spoken = t(r.key === 'posts' ? 'mute.postsFrom' : 'mute.storiesFrom', { username });
          return (
            <Pressable
              key={r.key}
              onPress={() => {
                tap('select');
                set(r.key, !muted[r.key]);
              }}
              accessibilityRole="switch"
              accessibilityLabel={spoken}
              accessibilityState={{ checked: muted[r.key] }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
              <Icon name={r.icon} size={24} color={C.fg} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 17 }}>{label}</Text>
              {/* The whole row is the switch for screen readers; this is the part you see and can also tap. */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Toggle value={muted[r.key]} onChange={(v) => set(r.key, v)} label={spoken} />
              </View>
            </Pressable>
          );
        })
      ) : (
        // The same height as the rows, so the sheet doesn't jump when they arrive.
        <View style={{ height: ROWS.length * 52, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.fg2} />
        </View>
      )}
      <View style={{ height: 8 }} />
    </Sheet>
  );
}
