// Community Plus profile styling on the desktop: the ring colour round a member's picture and
// highlights, and the profile theme (a band of colour behind the top of the profile, and buttons and
// links in the theme's accent). The choices themselves live in the shared src/lib/styling.ts, the
// same list the iPhone app offers. Also the "Profile style" dialog where a Plus member picks them.
import React, { useState } from 'react';
import { updateProfile } from 'shared/api';
import { PROFILE_THEMES, RING_STYLES, profileTheme, ringColors, type ProfileTheme } from 'shared/styling';
import { useAppearance } from '../lib/appearance';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, toast, toastError } from './kit';
import '../styles/profile.css';

/** A CSS gradient through a ring's colours, bottom-left to top-right as on the iPhone. */
export function gradient(colors: readonly string[]): string {
  return colors.length > 1 ? `linear-gradient(45deg, ${colors.join(', ')})` : colors[0] ?? 'transparent';
}

/** The ring's colours as a CSS variable, for the elements that draw a ring (.prof-ring, .prof-hl-ring). */
export function ringVar(colors: readonly string[] | null): React.CSSProperties | undefined {
  return colors ? ({ '--ring': gradient(colors) } as React.CSSProperties) : undefined;
}

/**
 * A theme's colours as CSS variables for the profile page:
 *   --prof-accent / --prof-on-accent  buttons on the page (deeper accents on the White appearance,
 *                                     where the pale ones would not show, exactly as on the iPhone)
 *   --prof-link                       links and mentions on the page
 *   --prof-band                       the band behind the header, which fades into the page
 * The standard theme ('') keeps the app's own green and has no band.
 */
export function themeVars(t: ProfileTheme, white: boolean): React.CSSProperties {
  if (!t.id) return {};
  const vars: Record<string, string> = white
    ? { '--prof-accent': t.lightAccent, '--prof-on-accent': '#ffffff', '--prof-link': t.lightAccent }
    : { '--prof-accent': t.accent, '--prof-on-accent': t.onAccent, '--prof-link': t.accent };
  if (t.band.length) {
    // Held under the header, then faded into the page over its last 48 points.
    const stops = t.band.map((c, i) => `${c} ${t.band.length === 1 ? '0%' : `calc((100% - 48px) * ${i / (t.band.length - 1)})`}`);
    vars['--prof-band'] = `linear-gradient(180deg, ${stops.join(', ')}, ${t.band[t.band.length - 1]} calc(100% - 48px), var(--bg) 100%)`;
    // The band is always a deep colour, so what sits on it uses the accents made for a dark page.
    vars['--prof-band-accent'] = t.accent;
    vars['--prof-band-on-accent'] = t.onAccent;
  }
  return vars as React.CSSProperties;
}

/** The theme of a profile and whether the app is in its White appearance. */
export function useProfileLook(themeId: string | null | undefined) {
  const white = useAppearance() === 'white';
  const theme = profileTheme(themeId);
  return { theme, white, banded: theme.band.length > 0, vars: themeVars(theme, white) };
}

/* ---------- the Profile style dialog ---------- */

function Preview({ ring, theme }: { ring: string; theme: string }) {
  const { me } = useMe();
  const look = useProfileLook(theme);
  return (
    <div className="prof-style-preview" style={look.vars} aria-label="Preview of your profile" role="img">
      <div className={'prof-style-band' + (look.banded ? ' on' : '')}>
        <span className="prof-ring on" style={ringVar(ringColors(ring))}>
          <Avatar src={me.avatar_url} name={me.username} size={64} />
        </span>
        <b>{me.full_name || me.username}</b>
        <span className="prof-style-user">{me.username}</span>
        <div className="prof-style-btns">
          <span className="prof-btn primary">Follow</span>
          <span className="prof-btn">Message</span>
        </div>
      </div>
      <div className="prof-style-dots">
        {[0, 1, 2].map((i) => (
          <span key={i} className={'prof-hl-ring' + (ring ? ' on' : '')} style={ring ? ringVar(ringColors(ring)) : undefined}>
            <span className="prof-hl-cover blank" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Community Plus: the colour of your ring and the look of your profile page. Others see Plus first. */
export function ProfileStyleDialog({ onClose }: { onClose: () => void }) {
  const { me, refresh } = useMe();
  const plus = !!me.plus;
  const [ring, setRing] = useState(me.ring_color ?? '');
  const [theme, setTheme] = useState(me.profile_theme ?? '');
  const [busy, setBusy] = useState(false);
  const changed = ring !== (me.ring_color ?? '') || theme !== (me.profile_theme ?? '');
  const white = useAppearance() === 'white';

  // Everyone can look, so they can see what Plus offers; only members can choose.
  const pick = (fn: () => void) => (plus ? fn() : toast('Profile style is part of Community Plus'));

  const save = async () => {
    if (busy || !changed) return;
    const patch: { ring_color?: string; profile_theme?: string } = {};
    if (ring !== (me.ring_color ?? '')) patch.ring_color = ring;
    if (theme !== (me.profile_theme ?? '')) patch.profile_theme = theme;
    setBusy(true);
    try {
      // The database refuses this for anyone without Plus, whatever the dialog shows.
      await updateProfile(me.id, patch);
      await refresh();
      toast('Profile style saved');
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <Modal title="Profile style" onClose={onClose} wide className="prof-style">
      <div className="prof-style-body">
        <Preview ring={ring} theme={theme} />
        {plus ? null : (
          <div className="prof-upsell">
            <Icon name="crown" size={24} />
            <div className="grow">
              <b>Part of Community Plus</b>
              <p className="muted-text">Choose the colour of your ring and the look of your profile.</p>
            </div>
            <button
              className="btn"
              onClick={() => {
                onClose();
                nav('/plus');
              }}
            >
              Get Community Plus
            </button>
          </div>
        )}
        <div className={plus ? '' : 'prof-style-locked'}>
          <h3 className="prof-style-h">Ring colour</h3>
          <div className="prof-swatches" role="radiogroup" aria-label="Ring colour">
            {RING_STYLES.map((r) => {
              const on = ring === r.id;
              return (
                <button key={r.id || 'standard'} role="radio" aria-checked={on} aria-label={r.label + ' ring'} className={'prof-swatch' + (on ? ' on' : '')} onClick={() => pick(() => setRing(r.id))}>
                  <span className="prof-swatch-dot" style={{ background: gradient(r.colors) }} />
                  <span>{r.label}</span>
                </button>
              );
            })}
          </div>
          <h3 className="prof-style-h">Profile theme</h3>
          <div className="prof-themes" role="radiogroup" aria-label="Profile theme">
            {PROFILE_THEMES.map((t) => {
              const on = theme === t.id;
              const vars = themeVars(t, white);
              return (
                <button key={t.id || 'standard'} role="radio" aria-checked={on} aria-label={t.label + ' theme'} className={'prof-theme-card' + (on ? ' on' : '')} onClick={() => pick(() => setTheme(t.id))} style={vars}>
                  <span className={'prof-theme-art' + (t.band.length ? ' banded' : '')}>
                    <span className="prof-theme-dot" />
                    <span className="prof-theme-follow">Follow</span>
                  </span>
                  <span className="prof-theme-name">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {plus ? (
        <div className="modal-foot prof-style-foot">
          <button className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!changed || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
