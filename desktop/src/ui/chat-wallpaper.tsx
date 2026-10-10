// Chat wallpapers, a Community Plus perk (src/lib/wallpapers.ts; the iPhone's app/(app)/chat-wallpaper.tsx).
// The choice is kept on this computer (prefs.chatWallpaper) and drawn behind the messages of every
// chat, for Plus members only. WallpaperPicker is shown from a chat's details ("Wallpaper") and from
// Settings: a preview of each wallpaper with a sample chat, and None to take it away.
import React from 'react';
import { loadPrefs, setPrefs, usePrefs } from 'shared/prefs';
import { WALLPAPERS, wallpaperById } from 'shared/wallpapers';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Icon, toast } from './kit';
import '../styles/messages.css';

// The saved choices are read at start-up (Settings does too; reading twice is harmless), so a chat
// opened first thing already has its wallpaper.
loadPrefs();

export type Wallpaper = (typeof WALLPAPERS)[number];

/** The gradient a wallpaper is drawn with: from the top left corner to the bottom right, as on the iPhone. */
export const wallpaperCss = (w: Wallpaper) => `linear-gradient(to bottom right, ${w.colors.join(', ')})`;

/** The wallpaper to draw behind the messages: the one chosen, for Plus members; otherwise none. */
export function useChatWallpaper(): Wallpaper | null {
  const { me } = useMe();
  const prefs = usePrefs();
  return me.plus && prefs.chatWallpaper ? wallpaperById(prefs.chatWallpaper) : null;
}

/**
 * The wallpaper chooser. Without Plus, a note leads to Community Plus and choosing one goes there.
 * `onDone` adds a Done button (and is called on the way to Plus), for when it sits in a dialog.
 */
export function WallpaperPicker({ onDone }: { onDone?: () => void }) {
  const { me } = useMe();
  const prefs = usePrefs();
  const plus = !!me.plus;
  const choices: { id: string; name: string; wall: Wallpaper | null }[] = [{ id: '', name: 'None', wall: null }, ...WALLPAPERS.map((w) => ({ id: w.id, name: w.name, wall: w }))];

  const toPlus = () => {
    onDone?.();
    nav('/plus');
  };
  const choose = (id: string) => {
    if (!plus) {
      toast('Chat wallpapers are part of Community Plus');
      toPlus();
      return;
    }
    setPrefs({ chatWallpaper: id });
  };

  return (
    <div className="mx-wall">
      {plus ? (
        <p className="mx-wall-sub">The look behind every chat on this computer. Only you see it.</p>
      ) : (
        <button type="button" className="mx-wall-upsell" onClick={toPlus}>
          <span className="mx-wall-crown">
            <Icon name="crown" size={22} />
          </span>
          <span className="mx-wall-upsell-text">
            <b>A Community Plus perk</b>
            <span>Choose the look behind every chat with Community Plus.</span>
          </span>
          <Icon name="right" size={18} stroke={2} />
        </button>
      )}
      <div className="mx-wall-grid" role="radiogroup" aria-label="Chat wallpaper">
        {choices.map((c) => {
          const on = plus && (prefs.chatWallpaper || '') === c.id;
          return (
            <button key={c.id || 'none'} type="button" role="radio" aria-checked={on} aria-label={c.name} className={'mx-wall-tile' + (on ? ' on' : '')} onClick={() => choose(c.id)}>
              <span className={'mx-wall-preview' + (c.wall ? ' walled' : '')} style={c.wall ? { backgroundImage: wallpaperCss(c.wall) } : undefined}>
                <SampleChat />
                {on ? (
                  <span className="mx-wall-check" aria-hidden="true">
                    <Icon name="check" size={14} stroke={3} />
                  </span>
                ) : null}
              </span>
              <span className="mx-wall-name">{c.name}</span>
            </button>
          );
        })}
      </div>
      {onDone ? (
        <div className="mx-wall-foot">
          <button type="button" className="btn" onClick={onDone}>
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A few lines of chat drawn small: a time, their message, yours and "Seen", as a chat would show them. */
function SampleChat() {
  return (
    <span className="mx-wall-sample" aria-hidden="true">
      <span className="mx-wall-stamp">TODAY AT 09:41</span>
      <span className="mx-wall-bubble">Happy Sabbath!</span>
      <span className="mx-wall-bubble mine">See you at church 🙏</span>
      <span className="mx-wall-seen">Seen</span>
    </span>
  );
}
