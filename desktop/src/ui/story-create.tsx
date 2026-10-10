// Making a story on the desktop: the iPhone app's Add to story and story editor (app/(app)/add-story.tsx
// and story-editor.tsx) as one full-window dialog, dark around the story like Instagram's desktop
// story creator. Steps: choose photos or videos (or Text, or Collage) → edit on the 9:16 canvas with
// the tools beside it → share (Your story or Close friends, Message, Add to highlight). The quick
// "Your story" and "Close friends" buttons under the canvas share straight away, as on the iPhone.
// It also starts from a post ("Add to story": the post's photo is the story) and from a story in the
// archive shared again (it opens with everything it had, to share as it is or change first).
// Uploads and saving go through the shared functions the iPhone app uses (uploadImage, uploadVideo,
// addStory, createHighlight, addToHighlight, sendToPeople).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addStory, addToHighlight, countCloseFriends, coverOf, createHighlight, fetchPost, sendToPeople } from 'shared/api';
import { errText } from 'shared/theme';
import type { Audience, Profile, StoryItem } from 'shared/types';
import type { CreateRequest } from '../lib/create';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import '../styles/stories.css';
import { Avatar, Icon, Spinner, ask, toast, toastError } from './kit';
import { Wordmark } from './sidebar';
import { StoryCanvas } from './stories';
import { StoryEditor } from './story-editor';
import { CLOSE_FRIENDS_HIGHLIGHT, CloseFriendsSheet, type HighlightChoice, SharePanel } from './story-share';
import { CollageCard, StartCard } from './story-start';
import { type Draft, LookFilters, MAX_FILES, type Source, type StoryRequest, buildItems, draftFromItem, emptyDraft, fitFor, hasWork, previewItem, readFile, wordsOf } from './story-parts';

type Step = 'loading' | 'start' | 'collage' | 'edit' | 'share';
type Busy = { text: string; done: number; total: number };

/** The canvas as tall as the window allows, leaving room for the tools and their panel on each side. */
function measure() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let h = Math.max(380, Math.min(H - 150, 940));
  let w = Math.round((h * 9) / 16);
  const side = 380;
  if (W - 2 * side < w) {
    w = Math.max(240, W - 2 * side);
    h = Math.round((w * 16) / 9);
  }
  return { w, h };
}

// Each request (Create → Story, Add to story, Share again) starts the editor afresh.
const keys = new WeakMap<object, number>();
let lastKey = 0;

export function StoryCreate({ request, onClose }: { request: CreateRequest; onClose: () => void }) {
  let k = keys.get(request);
  if (k === undefined) keys.set(request, (k = ++lastKey));
  return <Creator key={k} request={request} onClose={onClose} />;
}

function Creator({ request, onClose }: { request: CreateRequest; onClose: () => void }) {
  const { me } = useMe();
  // A story shared again opens straight in the editor, with everything it had.
  const [step, setStep] = useState<Step>(request.storyItem ? 'edit' : request.sharePostId ? 'loading' : 'start');
  const [d, setD] = useState<Draft>(() => (request.storyItem ? draftFromItem(request.storyItem) : emptyDraft('image')));
  const [page, setPage] = useState(0);
  const [collage, setCollage] = useState<Source[]>([]);
  const [size, setSize] = useState(measure);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [friends, setFriends] = useState<number | null>(null);
  const [friendsSheet, setFriendsSheet] = useState(false);
  // A story shared again goes back to the people who could see it the first time.
  const [audience, setAudience] = useState<Audience>((request as StoryRequest).audience ?? 'everyone');
  const [highlight, setHighlight] = useState<HighlightChoice | null>(null);
  const [recipients, setRecipients] = useState<Profile[]>([]);
  const made = useRef<string[]>([]);

  useEffect(() => {
    const fit = () => setSize(measure());
    window.addEventListener('resize', fit);
    document.body.classList.add('no-scroll');
    countCloseFriends(me.id).then(setFriends, () => setFriends(null));
    return () => {
      window.removeEventListener('resize', fit);
      if (!document.querySelector('.scrim')) document.body.classList.remove('no-scroll');
      // The files chosen on this computer are let go once the editor closes.
      made.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // "Add to story" on a post: its photo (or video) becomes the story, shared as it is on the server.
  useEffect(() => {
    if (!request.sharePostId) return;
    let alive = true;
    fetchPost(request.sharePostId).then(
      (post) => {
        if (!alive) return;
        const m = post?.media[0];
        if (!m) {
          toast('That post is no longer available.');
          return onClose();
        }
        const source: Source = m.type === 'video' ? { url: m.url, type: 'video', w: m.w ?? 0, h: m.h ?? 0, poster: m.poster, hosted: true } : { url: m.url, type: 'image', w: m.w ?? 0, h: m.h ?? 0, hosted: true, fit: fitFor(m.w ?? 0, m.h ?? 0) };
        setD(emptyDraft(source.type, [source]));
        setStep('edit');
      },
      (e) => {
        if (!alive) return;
        toastError(e);
        onClose();
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const set = (fn: (d: Draft) => Draft) => setD(fn);

  /** Reads chosen files, keeping what a story can take and saying why the rest was left out. */
  async function read(files: File[], room: number, only?: 'image'): Promise<Source[]> {
    const out: Source[] = [];
    let problem = '';
    for (const f of files) {
      if (out.length >= room) {
        problem ||= only ? 'A collage holds up to 4 photos.' : 'You can share up to 10 at once.';
        break;
      }
      if (only && !f.type.startsWith('image/')) {
        problem ||= 'Collages are made from photos.';
        continue;
      }
      try {
        const s = await readFile(f);
        made.current.push(s.url);
        out.push(s);
      } catch (e) {
        problem ||= errText(e);
      }
    }
    if (problem) toast(problem);
    return out;
  }

  const begin = async (files: File[]) => {
    const sources = await read(files, MAX_FILES);
    if (!sources.length) return;
    setD(emptyDraft(sources.length > 1 ? 'batch' : sources[0].type, sources));
    setPage(0);
    setStep('edit');
  };

  const addMore = async (files: File[]) => {
    const sources = await read(files, MAX_FILES - d.sources.length);
    if (sources.length) set((x) => ({ ...x, kind: 'batch', sources: [...x.sources, ...sources] }));
  };

  const close = async () => {
    if (busy) return;
    const work = hasWork(d) || collage.length > 0;
    if (work && !(await ask('Discard this story?', 'Your photos, text and drawing will be lost.', 'Discard'))) return;
    onClose();
  };

  // Esc: back a step, or close. The editor has its own (it first puts away a tool or a selection).
  const escape = useRef(() => {});
  escape.current = () => {
    if (busy) return;
    if (step === 'share') setStep('edit');
    else if (step === 'collage') setStep('start');
    else if (step !== 'edit') close();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.scrim')) return;
      escape.current();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  /** Uploads and shares, as the iPhone editor's share(): the stories first, then the highlight and the messages. */
  async function share(to: Audience, withExtras: boolean) {
    if (busy) return;
    if (d.kind === 'text' && !d.overlays.length && !d.strokes.length) return toast('Write or draw something first.');
    if (to === 'close_friends' && friends === 0) {
      if (await ask('Your close friends list is empty', 'Add people to it first. Only they will see stories you share with close friends.', 'Add people', false)) setFriendsSheet(true);
      return;
    }
    setBusy({ text: 'Uploading…', done: 0, total: 1 });
    let items: StoryItem[] = [];
    let posted = 0;
    try {
      items = await buildItems(me.id, d, (text, done, total) => setBusy({ text, done, total }));
      setBusy({ text: 'Sharing…', done: items.length, total: items.length });
      for (const item of items) {
        await addStory(me.id, item, to);
        posted++;
      }
      // The story is live from here on. If the highlight or the message fails, say so, but never
      // report the whole thing as failed: sharing again would post it twice.
      let extrasFailed = false;
      if (withExtras) {
        try {
          if (highlight && to !== 'close_friends') {
            if (highlight.id) for (const item of items) await addToHighlight(me.id, highlight.id, item);
            else await createHighlight(me.id, highlight.title, items);
          }
          if (recipients.length) await sendToPeople(me.id, recipients.map((p) => p.id), { media: items.map(coverOf).filter(Boolean), text: wordsOf(d) });
        } catch {
          extrasFailed = true;
        }
      }
      toast(extrasFailed ? 'Added to your story. The highlight or message did not go through.' : to === 'close_friends' ? 'Shared with your close friends' : items.length > 1 ? `${items.length} stories added` : 'Added to your story');
      finish();
    } catch (e) {
      if (posted > 0) {
        toast(`${posted} of ${items.length} were added to your story. The rest did not upload.`);
        finish();
        return;
      }
      setBusy(null);
      toastError(e);
    }
  }

  // A new story goes to Home, where it is first in the tray; one from a post or the archive stays put.
  const finish = () => {
    onClose();
    if (!request.sharePostId && !request.storyItem) nav('/');
  };

  const bottom = (
    <div className={'stc-bottom' + (size.w < 380 ? ' narrow' : '')}>
      <button className="stc-pill" aria-label="Share to your story" disabled={!!busy} onClick={() => share('everyone', false)}>
        <Avatar src={me.avatar_url} name={me.username} size={28} />
        <span>Your story</span>
      </button>
      <button className="stc-pill" aria-label="Share with close friends" disabled={!!busy} onClick={() => share('close_friends', false)}>
        <span className="stc-star">
          <Icon name="star" size={14} color="#fff" fill="#fff" stroke={0} />
        </span>
        <span>Close friends</span>
      </button>
      <button className="stc-next" aria-label="More ways to share" title="More ways to share" disabled={!!busy} onClick={() => setStep('share')}>
        <Icon name="arrow" size={22} color="#fff" stroke={2.4} />
      </button>
    </div>
  );

  const preview: StoryItem = { ...previewItem(d, page), overlays: d.kind === 'batch' ? undefined : d.overlays };
  const look = d.kind === 'image' && d.filter !== 'normal' ? d.filter : '';

  return createPortal(
    <div className="stc-stage" role="dialog" aria-modal="true" aria-label="Add to your story">
      <LookFilters />
      <div className="stc-top">
        <span className="stc-brand">
          <Wordmark />
        </span>
        <span className="stc-title">{step === 'share' ? 'Share' : step === 'edit' ? (d.kind === 'batch' ? `${d.sources.length} stories` : 'Your story') : ''}</span>
        <button className="stc-x" aria-label="Close" disabled={!!busy} onClick={close}>
          <Icon name="close" size={28} color="#fff" stroke={2} />
        </button>
      </div>

      {step === 'loading' ? (
        <div className="stc-body single">
          <Spinner size={36} />
        </div>
      ) : step === 'start' ? (
        <div className="stc-body single">
          <StartCard
            onFiles={begin}
            onText={() => {
              setD(emptyDraft('text'));
              setStep('edit');
            }}
            onCollage={() => setStep('collage')}
          />
        </div>
      ) : step === 'collage' ? (
        <div className="stc-body single">
          <CollageCard
            photos={collage}
            onFiles={async (files) => {
              const more = await read(files, 4 - collage.length, 'image');
              if (more.length) setCollage((c) => [...c, ...more].slice(0, 4));
            }}
            onRemove={(i) => setCollage((c) => c.filter((_, j) => j !== i))}
            onBack={() => setStep('start')}
            onNext={() => {
              setD(emptyDraft('collage', collage));
              setStep('edit');
            }}
          />
        </div>
      ) : step === 'edit' ? (
        <div className="stc-body">
          <StoryEditor d={d} set={set} size={size} page={page} setPage={setPage} bottom={bottom} onLeave={close} onMore={addMore} />
        </div>
      ) : (
        <div className="stc-body">
          <div className="stc-left" />
          <div className="stc-center" style={{ width: size.w }}>
            <div className={'stc-canvas stc-preview' + (look ? ' stc-filtered' : '')} style={{ width: size.w, height: size.h, ...(look ? ({ ['--stc-look' as any]: `url(#stc-look-${look})` } as React.CSSProperties) : {}) }}>
              <StoryCanvas item={preview} width={size.w} height={size.h} muted />
            </div>
            {d.kind === 'batch' ? <p className="stc-bottom stc-bottom-note">{d.sources.length} stories, shared one after another.</p> : null}
          </div>
          <div className="stc-right">
            <SharePanel
              audience={audience}
              setAudience={(a) => {
                setAudience(a);
                if (a === 'close_friends' && highlight) toast(CLOSE_FRIENDS_HIGHLIGHT);
              }}
              friends={friends}
              highlight={highlight}
              setHighlight={setHighlight}
              recipients={recipients}
              setRecipients={setRecipients}
              busy={!!busy}
              onShare={() => share(audience, true)}
              onBack={() => setStep('edit')}
              onFriends={() => setFriendsSheet(true)}
            />
          </div>
        </div>
      )}

      {busy ? (
        <div className="stc-busy" role="status" aria-live="polite">
          <Spinner size={36} />
          <b>{busy.text}</b>
          <span className="stc-progress">
            <i style={{ width: `${Math.round((Math.min(busy.done + 0.5, busy.total) / Math.max(1, busy.total)) * 100)}%` }} />
          </span>
        </div>
      ) : null}

      {friendsSheet ? (
        <CloseFriendsSheet
          onClose={(n) => {
            setFriendsSheet(false);
            setFriends(n);
            if (n === 0 && audience === 'close_friends') setAudience('everyone');
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
