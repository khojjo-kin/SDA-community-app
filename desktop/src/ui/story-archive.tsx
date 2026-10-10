// Your story archive, as the iPhone's (app/(app)/archive.tsx and story-archive/[id].tsx): every story
// you have shared drawn small in the grid with its text and drawing, and one opened large with
// Highlight, Share again and Delete. Share again opens the story editor with the story in it, to
// share as it is or change first.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteStory } from 'shared/api';
import type { ArchivedStory, StoryItem } from 'shared/types';
import { openCreate } from '../lib/create';
import { t } from '../lib/i18n';
import { nav } from '../lib/router';
import '../styles/stories.css';
import { Icon, type IconName, ask, toast, toastError } from './kit';
import { Wordmark } from './sidebar';
import { StoryCanvas } from './stories';
import { HighlightPicker, shortDay } from './story-extras';
import type { StoryRequest } from './story-parts';
import { CLOSE_FRIENDS_HIGHLIGHT } from './story-share';

/** A story as a still picture for a grid: a video shows its poster, and the caption is left off. */
const still = (item: StoryItem): StoryItem => ({ ...(item.type === 'video' ? { ...item, type: 'image', url: item.poster ?? '' } : item), caption: undefined });

/** A story drawn to fill its box (9:16), with its text, stickers and drawing. */
export function StoryThumb({ item }: { item: StoryItem }) {
  const box = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={box} className="sar-thumb" aria-hidden="true">
      {w ? <StoryCanvas item={still(item)} width={w} height={Math.round((w * 16) / 9)} paused muted /> : null}
    </span>
  );
}

const isLive = (s: ArchivedStory) => new Date(s.expires_at).getTime() > Date.now();

function Action({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button className="sar-action" onClick={onClick}>
      <Icon name={icon} size={24} color="#fff" />
      <span>{label}</span>
    </button>
  );
}

/** One archived story at a time, large, with the arrows (and ← →) to the ones beside it in the grid. */
export function ArchiveViewer({ entries, start, onClose, onDeleted }: { entries: ArchivedStory[]; start: number; onClose: () => void; onDeleted: (id: string) => void }) {
  const [at, setAt] = useState(Math.max(0, Math.min(start, entries.length - 1)));
  const [picking, setPicking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [size, setSize] = useState(measure);
  const s = entries[Math.min(at, entries.length - 1)];

  useEffect(() => {
    const fit = () => setSize(measure());
    window.addEventListener('resize', fit);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('resize', fit);
      if (!document.querySelector('.scrim')) document.body.classList.remove('no-scroll');
    };
  }, []);

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (document.querySelector('.scrim')) return;
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowRight') setAt((a) => Math.min(entries.length - 1, a + 1));
    else if (e.key === 'ArrowLeft') setAt((a) => Math.max(0, a - 1));
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  if (!s) return null;
  const friendsOnly = s.audience === 'close_friends';
  // A mention on the story opens that person's profile.
  const openMention = (id: string) => {
    const who = s.item.overlays?.find((o) => o.userId === id)?.text;
    if (!who) return;
    onClose();
    nav('/u/' + who);
  };

  const remove = async () => {
    if (!(await ask(t('d.stories.deleteQuestion'), t('d.stories.deleteArchivedBody'), t('common.delete')))) return;
    try {
      await deleteStory(s.id);
      toast(t('d.stories.deleted'));
      if (entries.length <= 1) onClose();
      else setAt((a) => Math.min(a, entries.length - 2));
      onDeleted(s.id);
    } catch (e) {
      toastError(e);
    }
  };

  return createPortal(
    <div className="sar-stage" role="dialog" aria-modal="true" aria-label={t('d.stories.archivedStory')}>
      <span className="stc-brand">
        <Wordmark />
      </span>
      <button className="stc-x" aria-label={t('common.close')} onClick={onClose}>
        <Icon name="close" size={28} color="#fff" stroke={2} />
      </button>
      <div className="sar-center">
        <div className="sar-wrap">
          {at > 0 ? (
            <button className="sar-nav left" aria-label={t('d.stories.newerStory')} onClick={() => setAt(at - 1)}>
              <Icon name="back" size={16} color="#000" stroke={2.4} />
            </button>
          ) : null}
          {at < entries.length - 1 ? (
            <button className="sar-nav right" aria-label={t('d.stories.olderStory')} onClick={() => setAt(at + 1)}>
              <Icon name="right" size={16} color="#000" stroke={2.4} />
            </button>
          ) : null}
          <div className="sar-card" key={s.id} style={{ width: size.w, height: size.h }}>
            <StoryCanvas item={s.item} width={size.w} height={size.h} muted={muted} onBlocked={() => setMuted(true)} onMention={openMention} />
            <span className="sv-shade top" />
            <div className="sar-top">
              <b>{shortDay(new Date(s.created_at))}</b>
              {friendsOnly ? (
                <span className="sv-close-friends" title={t('settings.closeFriends')} aria-label={t('d.stories.sharedWithCloseFriends')}>
                  <Icon name="star" size={11} color="#fff" fill="#fff" stroke={0} />
                </span>
              ) : null}
              {isLive(s) ? <span className="sar-live">{t('d.stories.onStoryNow')}</span> : null}
              <span className="grow" />
              {s.item.type === 'video' ? (
                <button className="icon-btn" aria-label={muted ? t('d.stories.soundOn') : t('d.stories.muteSound')} onClick={() => setMuted(!muted)}>
                  <Icon name={muted ? 'mute' : 'sound'} size={20} color="#fff" />
                </button>
              ) : null}
              <span className="sar-pos">{t('d.stories.nOfTotal', { n: at + 1, total: entries.length })}</span>
            </div>
          </div>
        </div>
        <div className="sar-actions">
          <Action icon="highlight" label={t('d.stories.highlight')} onClick={() => (friendsOnly ? toast(t(CLOSE_FRIENDS_HIGHLIGHT)) : setPicking(true))} />
          <Action
            icon="story"
            label={t('d.stories.shareAgain')}
            onClick={() => {
              onClose();
              openCreate({ mode: 'story', storyItem: s.item, audience: s.audience } as StoryRequest);
            }}
          />
          <Action icon="trash" label={t('common.delete')} onClick={remove} />
        </div>
      </div>
      {picking ? <HighlightPicker item={s.item} onClose={() => setPicking(false)} /> : null}
    </div>,
    document.body,
  );
}

function measure() {
  const h = Math.max(320, Math.min(window.innerHeight - 150, 900));
  return { w: Math.round((h * 9) / 16), h };
}
