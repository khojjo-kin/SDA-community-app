// Settings for how the app looks and plays on this computer, from the iPhone's plus-font.tsx,
// chat-wallpaper.tsx, reel-settings.tsx and clips-settings.tsx: the app font chooser (a Plus perk,
// also shown on the Plus page), the chat wallpaper page, and Shorts (sound, captions and their
// language). These choices are the shared prefs (shared/prefs), kept on this computer.
import React, { useEffect, useState } from 'react';
import { LANGUAGES, languageName } from 'shared/i18n';
import { setPrefs, usePrefs } from 'shared/prefs';
import { wallpaperById } from 'shared/wallpapers';
import { APP_FONTS, appFontById, loadFontFace, noteFontMember } from '../lib/font';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { WallpaperPicker } from '../ui/chat-wallpaper';
import { Modal, toast } from '../ui/kit';
import { Block, Card, LinkRow, Page, PlusUpsell, RadioRow, ToggleRow } from './settings-ui';

/* ---------- App font ---------- */

/**
 * The faces to choose from, each line drawn in its own face (name and sample), as on the iPhone. A
 * member without Plus sees them as a preview under the Plus offer, with nothing chosen.
 */
export function FontChooser({ onChosen }: { onChosen?: () => void }) {
  const { me } = useMe();
  const { appFont } = usePrefs();
  const plus = !!me.plus;
  // Every face is fetched while the chooser shows, so each sample is drawn in its own face.
  useEffect(() => APP_FONTS.forEach((f) => loadFontFace(f.id)), []);
  // This screen knows the member's Plus for certain: tell the app's font straight away.
  useEffect(() => noteFontMember(me.id, plus), [me.id, plus]);

  const choose = (id: string) => {
    if (!plus || id === appFont) return;
    setPrefs({ appFont: id });
    toast('Font changed');
    onChosen?.();
  };
  return (
    <>
      {plus ? null : <PlusUpsell title="App fonts are part of Community Plus" body="Set Community in Nunito, Lora or Poppins on this computer." />}
      <Card className={'st-fonts' + (plus ? '' : ' preview')}>
        {APP_FONTS.map((f) => {
          const on = plus && appFontById(appFont).id === f.id;
          return (
            <label key={f.id || 'standard'} className={'st-row st-choice st-font' + (on ? ' on' : '') + (plus ? '' : ' disabled')} data-font={f.id || 'standard'}>
              <span className="st-font-aa" style={{ fontFamily: f.stack }} aria-hidden="true">
                Aa
              </span>
              <span className="st-row-text" style={{ fontFamily: f.stack }}>
                <b>{f.name}</b>
                <span>{f.sample}</span>
              </span>
              <input type="radio" className="st-radio" name="app-font" checked={on} disabled={!plus} onChange={() => choose(f.id)} aria-label={`${f.name}. ${f.sample}`} />
            </label>
          );
        })}
      </Card>
    </>
  );
}

/* ---------- Chat wallpaper ---------- */

/** The Chat wallpaper line: the one in use, opening its page. */
export function WallpaperRow() {
  const { me } = useMe();
  const { chatWallpaper } = usePrefs();
  const value = me.plus ? wallpaperById(chatWallpaper)?.name ?? 'None' : 'Plus';
  return <LinkRow icon="wallpaper" title="Chat wallpaper" sub="The background behind every chat." value={value} to="/accounts/chat-wallpaper" />;
}

/** Settings → Chat wallpaper: the picker the chats use (it offers Plus to members without it). */
export function ChatWallpaper() {
  return (
    <Page title="Chat wallpaper" intro="Choose the background behind your chats. It is kept on this computer.">
      <div className="st-wallpaper">
        <WallpaperPicker onDone={() => nav('/accounts/appearance')} />
      </div>
    </Page>
  );
}

/* ---------- Shorts ---------- */

/** Captions can be shown in the app's languages, except Italian (as on the iPhone). '' follows the app. */
const CAPTION_LANGUAGES: string[] = ['', ...LANGUAGES.map((l) => l.code).filter((code) => code !== 'it')];
const captionName = (code: string) => (code ? languageName(code) : 'App language');
/** The English name under a language's own name, when they differ ("Français", then "French"). */
function captionSub(code: string): string | undefined {
  if (!code) return 'The language Community is in';
  const l = LANGUAGES.find((x) => x.code === code);
  return l && l.name !== l.native ? l.name : undefined;
}

/** Settings → Shorts: the sound, the captions and their language, and what Shorts show (iPhone: Shorts and Your feed). */
export function ShortsSettings() {
  const prefs = usePrefs();
  const [languages, setLanguages] = useState(false);
  return (
    <Page title="Shorts" intro="How Shorts play on this computer. Your phone keeps its own choices.">
      <Block title="Sound">
        <Card>
          <ToggleRow icon="mute" title="Start Shorts with the sound off" sub="Turn the sound on in any Short with its speaker button." on={prefs.reelsMuted} onChange={(v) => setPrefs({ reelsMuted: v })} />
        </Card>
      </Block>
      <Block title="Captions">
        <Card>
          <ToggleRow icon="text" title="Show captions" sub="Words on screen as people speak, on Shorts that have them." on={prefs.captions} onChange={(v) => setPrefs({ captions: v })} />
          <LinkRow icon="globe" title="Caption language" sub="Captions in another language are translated for you." value={captionName(prefs.captionLang)} onClick={() => setLanguages(true)} testId="caption-language" />
        </Card>
      </Block>
      <Block title="What you see">
        <Card>
          <LinkRow icon="sliders" title="Content preferences" sub="Topics you want more and less of in Shorts, For you and Explore, and sensitive content." to="/accounts/content" />
        </Card>
      </Block>
      {languages ? (
        <Modal title="Caption language" onClose={() => setLanguages(false)}>
          <div className="st-modal-body st-caption-langs">
            <Card>
              {CAPTION_LANGUAGES.map((code) => (
                <RadioRow
                  key={code || 'app'}
                  name="caption-language"
                  title={captionName(code)}
                  sub={captionSub(code)}
                  checked={prefs.captionLang === code}
                  onChange={() => {
                    setPrefs({ captionLang: code });
                    setLanguages(false);
                  }}
                />
              ))}
            </Card>
          </div>
        </Modal>
      ) : null}
    </Page>
  );
}
