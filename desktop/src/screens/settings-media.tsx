// Settings for how the app looks and plays on this computer, from the iPhone's plus-font.tsx,
// chat-wallpaper.tsx, reel-settings.tsx and clips-settings.tsx: the app font chooser (a Plus perk,
// also shown on the Plus page), the chat wallpaper page, and Shorts (sound, captions and their
// language). These choices are the shared prefs (shared/prefs), kept on this computer.
import React, { useEffect, useState } from 'react';
import { LANGUAGES, languageName } from 'shared/i18n';
import { setPrefs, usePrefs } from 'shared/prefs';
import { wallpaperById } from 'shared/wallpapers';
import { APP_FONTS, appFontById, loadFontFace, noteFontMember } from '../lib/font';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { WallpaperPicker } from '../ui/chat-wallpaper';
import { Modal, toast } from '../ui/kit';
import { Block, Card, LinkRow, Page, PlusUpsell, RadioRow, ToggleRow } from './settings-ui';

/* ---------- App font ---------- */

/** Each face's name and sample line (keys), by its id; a face not listed here shows its own words. */
const FONT_WORDS: Record<string, { name?: string; sample: string }> = {
  '': { name: 'feed.standard', sample: 'd.settings-more.fontSampleStandard' },
  nunito: { sample: 'd.settings-more.fontSampleNunito' },
  lora: { sample: 'd.settings-more.fontSampleLora' },
  poppins: { sample: 'd.settings-more.fontSamplePoppins' },
};

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
    toast(t('d.settings-more.fontChanged'));
    onChosen?.();
  };
  return (
    <>
      {plus ? null : <PlusUpsell title={t('d.settings-more.fontsUpsellTitle')} />}
      <Card className={'st-fonts' + (plus ? '' : ' preview')}>
        {APP_FONTS.map((f) => {
          const on = plus && appFontById(appFont).id === f.id;
          const words = FONT_WORDS[f.id];
          const name = words?.name ? t(words.name) : f.name;
          const sample = words ? t(words.sample) : f.sample;
          return (
            <label key={f.id || 'standard'} className={'st-row st-choice st-font' + (on ? ' on' : '') + (plus ? '' : ' disabled')} data-font={f.id || 'standard'}>
              <span className="st-font-aa" style={{ fontFamily: f.stack }} aria-hidden="true">
                Aa
              </span>
              <span className="st-row-text" style={{ fontFamily: f.stack }}>
                <b>{name}</b>
                <span>{sample}</span>
              </span>
              <input type="radio" className="st-radio" name="app-font" checked={on} disabled={!plus} onChange={() => choose(f.id)} aria-label={`${name}. ${sample}`} />
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
  const value = me.plus ? wallpaperById(chatWallpaper)?.name ?? t('create.none') : t('common.plus');
  return <LinkRow icon="wallpaper" title={t('settings.chatWallpaper')} value={value} to="/accounts/chat-wallpaper" />;
}

/** Settings → Chat wallpaper: the picker the chats use (it offers Plus to members without it). */
export function ChatWallpaper() {
  return (
    <Page title={t('settings.chatWallpaper')}>
      <div className="st-wallpaper">
        <WallpaperPicker onDone={() => nav('/accounts/appearance')} />
      </div>
    </Page>
  );
}

/* ---------- Shorts ---------- */

/** Captions can be shown in the app's languages, except Italian (as on the iPhone). '' follows the app. */
const CAPTION_LANGUAGES: string[] = ['', ...LANGUAGES.map((l) => l.code).filter((code) => code !== 'it')];
const captionName = (code: string) => (code ? languageName(code) : t('settings.appLanguage'));
/** The English name under a language's own name, when they differ ("Français", then "French"), as on the iPhone. */
function captionSub(code: string): string | undefined {
  if (!code) return t('feed.appLanguageSub');
  const l = LANGUAGES.find((x) => x.code === code);
  return l && l.name !== l.native ? l.name : undefined;
}

/** Settings → Shorts: the sound, the captions and their language, and what Shorts show (iPhone: Shorts and Your feed). */
export function ShortsSettings() {
  const prefs = usePrefs();
  const [languages, setLanguages] = useState(false);
  return (
    <Page title={t('tabs.clips')}>
      <Block title={t('clips.sound')}>
        <Card>
          <ToggleRow icon="mute" title={t('d.settings-more.startMuted')} on={prefs.reelsMuted} onChange={(v) => setPrefs({ reelsMuted: v })} />
        </Card>
      </Block>
      <Block title={t('clips.captions')}>
        <Card>
          <ToggleRow icon="text" title={t('feed.showCaptions')} on={prefs.captions} onChange={(v) => setPrefs({ captions: v })} />
          <LinkRow icon="globe" title={t('settings.captionLanguage')} value={captionName(prefs.captionLang)} onClick={() => setLanguages(true)} testId="caption-language" />
        </Card>
      </Block>
      <Block title={t('clips.whatYouSee')}>
        <Card>
          <LinkRow icon="sliders" title={t('d.settings-more.contentTitle')} to="/accounts/content" />
        </Card>
      </Block>
      {languages ? (
        <Modal title={t('settings.captionLanguage')} onClose={() => setLanguages(false)}>
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
