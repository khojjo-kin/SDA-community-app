// The first steps of a new story, as the iPhone's Add to story screen (app/(app)/add-story.tsx) on a
// computer: drag in or choose photos and videos (one is a story; up to 10 are shared together, each
// as its own story), or start a text story or a collage. The collage step chooses 2 to 4 photos and
// shows them in the iPhone's layouts (src/components/StoryCanvas.tsx: two stacked; one over two; two
// over two).
import React, { useRef, useState } from 'react';
import { t, tn } from '../lib/i18n';
import '../styles/stories.css';
import { Icon, type IconName } from './kit';
import type { Source } from './story-parts';

/** Accepts files dropped anywhere on `children`. */
function Drop({ onFiles, className, children }: { onFiles: (files: File[]) => void; className: string; children: React.ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={className + (over ? ' over' : '')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {children}
    </div>
  );
}

function Mode({ icon, glyph, title, sub, colors, onClick }: { icon?: IconName; glyph?: string; title: string; sub: string; colors: [string, string]; onClick: () => void }) {
  return (
    <button className="stc-mode" onClick={onClick}>
      <span className="stc-mode-icon" style={{ background: `linear-gradient(45deg, ${colors[0]}, ${colors[1]})` }}>
        {icon ? <Icon name={icon} size={22} color="#fff" stroke={2.2} /> : <b>{glyph}</b>}
      </span>
      <span className="stc-mode-text">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
      <Icon name="right" size={16} color="var(--fg3)" stroke={2} />
    </button>
  );
}

/** Photos and videos, a text story or a collage. */
export function StartCard({ onFiles, onText, onCollage }: { onFiles: (files: File[]) => void; onText: () => void; onCollage: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="stc-card stc-start" role="dialog" aria-label={t('profile.addToStory')}>
      <div className="stc-card-head">
        <h2>{t('profile.addToStory')}</h2>
      </div>
      <Drop className="stc-drop" onFiles={onFiles}>
        <span className="stc-drop-art" aria-hidden="true">
          <Icon name="image" size={46} stroke={1.3} />
          <Icon name="video" size={40} stroke={1.3} />
        </span>
        <h3>{t('d.stories.dragHere')}</h3>
        <p>{t('d.stories.chooseUpTo')}</p>
        <button className="btn" onClick={() => input.current?.click()}>
          {t('d.stories.selectFromComputer')}
        </button>
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden data-testid="story-files" onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </Drop>
      <div className="stc-modes">
        <Mode glyph="Aa" title={t('d.stories.text')} sub={t('d.stories.textSub')} colors={['#4a5df6', '#b13df0']} onClick={onText} />
        <Mode icon="collage" title={t('d.stories.collage')} sub={t('d.stories.collageSub')} colors={['#0fb58a', '#0a6cf0']} onClick={onCollage} />
      </div>
    </div>
  );
}

/** The collage, as it will look: the photos chosen in the iPhone's layout, and a space for the next one. */
function CollagePreview({ photos, onAdd }: { photos: Source[]; onAdd: () => void }) {
  const slots = Math.max(2, photos.length);
  return (
    <div className={'stc-collage-frame collage n' + slots}>
      {Array.from({ length: slots }, (_, i) =>
        photos[i] ? (
          <img key={photos[i].url} src={photos[i].url} alt={t('d.stories.photoN', { n: i + 1 })} />
        ) : (
          <button key={'empty' + i} className="stc-slot" aria-label={t('d.stories.addPhoto')} onClick={onAdd}>
            <Icon name="plus" size={26} color="#fff" />
          </button>
        ),
      )}
    </div>
  );
}

/** Choose 2 to 4 photos for a collage. */
export function CollageCard({ photos, onFiles, onRemove, onBack, onNext }: { photos: Source[]; onFiles: (files: File[]) => void; onRemove: (i: number) => void; onBack: () => void; onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();
  return (
    <div className="stc-card stc-collage" role="dialog" aria-label={t('d.stories.collage')}>
      <div className="stc-card-head with-actions">
        <button className="icon-btn" aria-label={t('common.back')} onClick={onBack}>
          <Icon name="back" size={22} />
        </button>
        <h2>{t('d.stories.collage')}</h2>
        <button className="link-btn" disabled={photos.length < 2} onClick={onNext}>
          {t('d.stories.next')}
        </button>
      </div>
      <Drop className="stc-collage-body" onFiles={onFiles}>
        <CollagePreview photos={photos} onAdd={pick} />
        <div className="stc-collage-side">
          <p className="stc-collage-help">{t('d.stories.collageHelp')}</p>
          <div className="stc-collage-list">
            {photos.map((p, i) => (
              <div key={p.url} className="stc-collage-item">
                <img src={p.url} alt="" />
                <span>{t('d.stories.photoN', { n: i + 1 })}</span>
                <button className="icon-btn" aria-label={t('d.stories.removePhotoN', { n: i + 1 })} onClick={() => onRemove(i)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
          {photos.length < 4 ? (
            <button className="btn quiet" onClick={pick}>
              <Icon name="plus" size={16} /> {photos.length ? t('d.stories.addAnotherPhoto') : t('d.stories.choosePhotos')}
            </button>
          ) : (
            <p className="stc-note">{t('d.stories.collageMax')}</p>
          )}
          <p className="stc-note">{photos.length < 2 ? tn('d.stories.chooseMore', 2 - photos.length) : t('d.stories.photosReady', { count: photos.length })}</p>
          <input ref={input} type="file" accept="image/*" multiple hidden data-testid="collage-files" onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>
      </Drop>
    </div>
  );
}
