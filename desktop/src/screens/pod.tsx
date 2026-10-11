// Pod: songs and podcasts, from the iPhone app (app/(app)/pod.tsx, pod/[id].tsx, pod-new.tsx and
// src/components/NowPlayingBar.tsx), laid out for a wide window.
//   /pod        the shelf of popular tracks, Songs, Podcasts and Your library, and Add to Pod
//   /pod/<id>   the full player: artwork, scrubber, shuffle, repeat, up next. Works as a link too.
//   /pod/new    Add to Pod (Plus members and admins)
// The sound itself is the app-wide player in ui/player.tsx, so it keeps going while you browse.
import React, { useEffect, useRef, useState } from 'react';
import { addPodItem, deletePodItem, fetchPod, fetchPodItem, fetchPodLibrary, fetchPopularPod, setPodSaved, uploadAudio, uploadImage } from 'shared/api';
import { clock, errText } from 'shared/theme';
import type { PodItem } from 'shared/types';
import { dateLocale, t, tn, tSplit } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { rememberSize } from '../shims/expo-file-system';
import { ChoiceMenu, Empty, Failed, Icon, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { ShuffleRepeat, usePlayer, useProgress } from '../ui/player';
import { SendText, copyText } from './bible';
import '../styles/church.css';

const kindLabel = (k: PodItem['kind']) => (k === 'podcast' ? t('d.church.podcast') : t('d.church.song'));
/** The address of a track in this app, for Copy link. Opening it shows the track's player. */
const podLink = (id: string) => location.href.split('#')[0] + '#/pod/' + id;

/** Album art, or a square with the kind's icon when there is none. */
function Cover({ item, className = 'pod-cover' }: { item: Pick<PodItem, 'cover_url' | 'kind'>; className?: string }) {
  return <span className={className}>{item.cover_url ? <img src={item.cover_url} alt="" /> : <Icon name={item.kind === 'podcast' ? 'podcast' : 'music'} size={22} />}</span>;
}

/* ---------- a track's menu: open, library, link, delete ---------- */

function useTrackActions(onChange: (next: PodItem | null) => void) {
  const { me } = useMe();
  const player = usePlayer();
  const canDelete = (it: PodItem) => it.user_id === me.id || !!me.admin_role;
  const save = async (it: PodItem) => {
    const next = !it.saved;
    try {
      await setPodSaved(me.id, it.id, next);
      player.patch(it.id, { saved: next });
      onChange({ ...it, saved: next });
      toast(next ? t('d.church.addedToLibrary') : t('d.church.removedFromLibrary'));
    } catch (e) {
      toastError(e);
    }
  };
  const copy = async (it: PodItem) => toast((await copyText(podLink(it.id))) ? t('d.church.linkCopied') : t('d.church.linkNotCopied'));
  const remove = async (it: PodItem) => {
    if (!(await ask(t('d.church.deleteTrack', { title: it.title }), t('d.church.deleteTrackBody'), t('common.delete')))) return false;
    try {
      await deletePodItem(it.id);
      player.remove(it.id);
      onChange(null);
      toast(t('d.church.deleted'));
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };
  return { canDelete, save, copy, remove };
}

/* ---------- /pod ---------- */

export function Pod({ path = '/pod' }: { path?: string }) {
  const seg = parts(path);
  if (seg[1] && seg[1] !== 'new') return <NowPlaying key={seg[1]} id={seg[1]} />;
  return <PodHome adding={seg[1] === 'new'} />;
}

function PodHome({ adding }: { adding: boolean }) {
  const { me } = useMe();
  const player = usePlayer();
  const canAdd = !!me.plus || !!me.admin_role;
  const [tab, setTab] = useState<'all' | 'song' | 'podcast' | 'library'>('all');
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const [menuFor, setMenuFor] = useState<PodItem | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(q), 250);
    return () => clearTimeout(timer);
  }, [q]);
  const popular = useLoad(() => fetchPopularPod(10), []);
  const list = useLoad<PodItem[]>(() => (tab === 'library' ? fetchPodLibrary(me.id) : fetchPod(tab === 'all' ? undefined : tab, needle)), [tab, needle]);
  const actions = useTrackActions(() => {
    list.reload();
    popular.reload();
  });

  const row = (it: PodItem, all: PodItem[]) => {
    const current = player.item?.id === it.id;
    return (
      <div key={it.id} className={'pod-row' + (current ? ' on' : '')}>
        <button className="pod-cover" onClick={() => player.play(it, all)} aria-label={t(current && player.playing ? 'd.church.pauseTitle' : 'd.church.playTitle', { title: it.title })}>
          {it.cover_url ? <img src={it.cover_url} alt="" /> : <Icon name={it.kind === 'song' ? 'music' : 'podcast'} size={22} />}
          <span className="pod-play">
            <Icon name={current && player.playing ? 'pause' : 'play'} size={18} color="#fff" />
          </span>
        </button>
        <Link to={'/pod/' + it.id} className="row-text ch-pod-title" title={t('d.church.openPlayer')}>
          <b className={current ? 'ch-accent' : ''}>{it.title}</b>
          <span>
            {it.artist || it.full_name} · {kindLabel(it.kind)}
            {it.plays ? ` · ${tn('d.church.plays', it.plays)}` : ''}
          </span>
        </Link>
        <span className="muted-text small">{it.duration_seconds ? clock(it.duration_seconds) : ''}</span>
        <button className="icon-btn" aria-label={it.saved ? t('d.church.unsaveLibrary') : t('d.church.saveLibrary')} onClick={() => actions.save(it)}>
          <Icon name={it.saved ? 'check' : 'plus'} size={20} />
        </button>
        <button className="icon-btn" aria-label={t('d.church.moreFor', { title: it.title })} onClick={() => setMenuFor(it)}>
          <Icon name="more" size={20} />
        </button>
      </div>
    );
  };

  return (
    <div className="page pod-page">
      <div className="ch-section-head ch-pod-head">
        <h1 className="page-title">{t('churchApps.pod')}</h1>
        <span className="grow" />
        {canAdd ? (
          <button className="btn" onClick={() => nav('/pod/new')}>
            <Icon name="plus" size={14} stroke={2.6} /> {t('d.church.addToPod')}
          </button>
        ) : null}
      </div>
      {popular.data?.length ? (
        <>
          <h3 className="section-h">{t('d.church.popular')}</h3>
          <div className="pod-shelf">
            {popular.data.map((it) => (
              <div key={it.id} className="pod-card ch-pod-card">
                <button className="pod-art" onClick={() => player.play(it, popular.data!)} aria-label={t('d.church.playTitle', { title: it.title })}>
                  {it.cover_url ? <img src={it.cover_url} alt="" /> : <Icon name={it.kind === 'song' ? 'music' : 'podcast'} size={34} />}
                  <span className="ch-art-play">
                    <Icon name={player.item?.id === it.id && player.playing ? 'pause' : 'play'} size={20} color="#fff" />
                  </span>
                </button>
                <Link to={'/pod/' + it.id} className="ch-pod-card-text">
                  <b>{it.title}</b>
                  <span>{it.artist || it.full_name}</span>
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className="pod-tools">
        <div className="seg left">
          {(['all', 'song', 'podcast', 'library'] as const).map((id) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {id === 'all' ? t('bibleMarks.all') : id === 'song' ? t('d.church.songs') : id === 'podcast' ? t('d.church.podcasts') : t('d.church.yourLibrary')}
            </button>
          ))}
        </div>
        {tab !== 'library' ? (
          <div className="panel-search in-modal pod-search">
            <input placeholder={t('d.church.searchPodPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('d.church.searchPod')} />
          </div>
        ) : null}
      </div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
      {list.data && !list.data.length ? (
        <Empty icon="headphones" title={tab === 'library' ? t('d.church.libraryEmpty') : t('bibleMarks.emptyFilter')} />
      ) : null}
      <div className="pod-list">{(list.data ?? []).map((it, _i, all) => row(it, all))}</div>
      {menuFor ? (
        <ChoiceMenu
          onClose={() => setMenuFor(null)}
          items={[
            { label: t('d.church.open'), bold: true, onClick: () => nav('/pod/' + menuFor.id) },
            { label: menuFor.saved ? t('d.church.unsaveLibrary') : t('d.church.addLibrary'), onClick: () => actions.save(menuFor) },
            { label: t('d.church.copyLink'), onClick: () => actions.copy(menuFor) },
            ...(actions.canDelete(menuFor) ? [{ label: t('common.delete'), danger: true, onClick: () => actions.remove(menuFor) }] : []),
          ]}
        />
      ) : null}
      {adding ? <AddToPod onClose={() => nav('/pod')} /> : null}
    </div>
  );
}

/* ---------- /pod/<id>: the full player ---------- */

function NowPlaying({ id }: { id: string }) {
  const player = usePlayer();
  const pos = useProgress();
  const loaded = useLoad(() => fetchPodItem(id), [id]);
  const [fetched, setFetched] = useState<PodItem | null>(null);
  const [menu, setMenu] = useState(false);
  const [send, setSend] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (loaded.data) {
      setFetched(loaded.data);
      player.patch(loaded.data.id, { saved: loaded.data.saved, plays: loaded.data.plays });
    }
  }, [loaded.data]);
  // When the track on this page moves on (Next, Previous, or the end of the track), the page follows it.
  const shown = useRef(player.item?.id);
  useEffect(() => {
    const was = shown.current;
    shown.current = player.item?.id;
    if (was === id && player.item && player.item.id !== id) nav('/pod/' + player.item.id, true);
  }, [player.item?.id]);
  const isCurrent = player.item?.id === id;
  const item = isCurrent ? player.item : player.queue.find((x) => x.id === id) ?? fetched;
  const actions = useTrackActions((next) => (next ? setFetched(next) : nav('/pod')));

  if (!item) {
    if (loaded.loading) return <Spinner />;
    if (loaded.error) return <Failed error={loaded.error} retry={loaded.reload} />;
    return (
      <Empty icon="headphones" title={t('d.church.trackGone')}>
        <Link to="/pod" className="btn quiet">
          {t('d.church.backToPod')}
        </Link>
      </Empty>
    );
  }
  const description = item.description?.trim() ?? '';
  const d = pos.d || item.duration_seconds || 0;
  const canNext = isCurrent && (player.upNext.length > 0 || player.repeat !== 'off' || player.queue.length > 1);
  // "Added by @name": the name is a link, drawn in the middle of the sentence.
  const addedBy = tSplit('d.church.addedBy', 'username');

  return (
    <div className="page ch-np">
      <div className="ch-np-bar">
        <Link to="/pod" className="link-btn muted">
          ← {t('churchApps.pod')}
        </Link>
        <span className="grow center ch-np-kicker">{(isCurrent ? t('d.church.playingNow') : kindLabel(item.kind)).toLocaleUpperCase(dateLocale())}</span>
        <button className="icon-btn" aria-label={t('profile.moreOptions')} onClick={() => setMenu(true)}>
          <Icon name="more" size={22} />
        </button>
      </div>
      <div className="ch-np-main">
        <div className={'ch-np-art' + (isCurrent && player.playing ? ' playing' : '')}>
          <Cover item={item} className="ch-np-cover" />
        </div>
        <div className="ch-np-side">
          <div className="ch-np-title">
            <span className="grow">
              <h1>{item.title}</h1>
              <p className="ch-accent">{item.artist || kindLabel(item.kind)}</p>
            </span>
          </div>
          {isCurrent ? (
            <>
              <div className="ch-scrub">
                <input type="range" min={0} max={d || 1} step={1} value={Math.min(pos.t, d || 1)} onChange={(e) => player.seek(Number(e.target.value))} aria-label={t('d.church.position')} aria-valuetext={t('d.church.positionOf', { position: clock(pos.t), length: clock(d) })} style={{ ['--ch-at' as string]: `${d ? Math.round((Math.min(pos.t, d) / d) * 100) : 0}%` }} />
                <span className="ch-scrub-times">
                  <span>{clock(pos.t)}</span>
                  <span>{d ? '-' + clock(Math.max(0, d - pos.t)) : '--:--'}</span>
                </span>
              </div>
              <div className="ch-transport">
                <button className="icon-btn" aria-label={t('d.church.previousTrack')} onClick={player.prev}>
                  <Icon name="skipback" size={30} />
                </button>
                <button className="ch-big-play" aria-label={player.playing ? t('d.church.pause') : t('d.church.play')} onClick={player.toggle}>
                  <Icon name={player.playing ? 'pause' : 'play'} size={34} />
                </button>
                <button className="icon-btn" aria-label={t('d.church.nextTrack')} disabled={!canNext} onClick={player.next}>
                  <Icon name="skipnext" size={30} />
                </button>
              </div>
              <div className="ch-extras">
                <ShuffleRepeat size={22} className="ch-extra" />
                <button className={'ch-extra' + (item.saved ? ' on' : '')} aria-label={item.saved ? t('d.church.unsaveLibrary') : t('d.church.addLibrary')} aria-pressed={item.saved} onClick={() => actions.save(item)}>
                  <Icon name="bookmark" size={22} fill={item.saved ? 'currentColor' : 'none'} />
                </button>
                <button className="ch-extra" aria-label={t('common.share')} onClick={() => setSend(true)}>
                  <Icon name="send" size={22} />
                </button>
              </div>
            </>
          ) : (
            <div className="ch-np-actions">
              <button className="btn big grow" onClick={() => player.play(item, [item])}>
                <Icon name="play" size={14} /> {t('d.church.play')}
              </button>
              <button className="btn big quiet grow" onClick={() => actions.save(item)}>
                {item.saved ? t('ssPub.saved') : t('ssPub.save')}
              </button>
              <button className="btn big quiet" aria-label={t('common.share')} onClick={() => setSend(true)}>
                <Icon name="send" size={18} />
              </button>
            </div>
          )}
          {item.duration_seconds > 0 && !isCurrent ? <p className="muted-text small">{clock(item.duration_seconds)}</p> : null}
          {description ? (
            <section className="ch-about">
              <h3>{t('d.church.about')}</h3>
              <p className={more ? '' : 'clamp'}>{description}</p>
              {description.length > 180 ? (
                <button className="link-btn" onClick={() => setMore(!more)}>
                  {more ? t('d.church.showLess') : t('d.church.readMore')}
                </button>
              ) : null}
            </section>
          ) : null}
          {item.username ? (
            <p className="muted-text small">
              {addedBy[0]}
              <Link to={'/u/' + item.username} className="ch-plain-link">
                @{item.username}
              </Link>
              {addedBy[1]} · {tn('d.church.plays', item.plays ?? 0)}
            </p>
          ) : null}
          {isCurrent && player.upNext.length ? (
            <section className="ch-upnext">
              <h3>{t('d.church.upNext')}</h3>
              {player.upNext.slice(0, 30).map((u) => (
                <button key={u.id} className="ch-up-row" onClick={() => player.jumpTo(u.id)} aria-label={t('d.church.playTitle', { title: u.title })}>
                  <Cover item={u} />
                  <span className="row-text">
                    <b>{u.title}</b>
                    <span>{u.artist ? `${u.artist} · ${kindLabel(u.kind)}` : kindLabel(u.kind)}</span>
                  </span>
                  <span className="muted-text small">{u.duration_seconds ? clock(u.duration_seconds) : ''}</span>
                </button>
              ))}
            </section>
          ) : null}
          {!isCurrent && player.item ? (
            <Link to={'/pod/' + player.item.id} className="ch-card-row">
              <Cover item={player.item} />
              <span className="row-text">
                <span>{player.playing ? t('d.church.playingNow') : t('d.church.paused')}</span>
                <b>{player.item.title}</b>
              </span>
              <Icon name="right" size={16} />
            </Link>
          ) : null}
        </div>
      </div>
      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(false)}
          items={[
            { label: item.saved ? t('d.church.unsaveLibrary') : t('d.church.addLibrary'), onClick: () => actions.save(item) },
            { label: t('d.church.copyLink'), onClick: () => actions.copy(item) },
            { label: t('d.church.sendToPeople'), onClick: () => setSend(true) },
            ...(actions.canDelete(item) ? [{ label: t('common.delete'), danger: true, onClick: () => actions.remove(item) }] : []),
          ]}
        />
      ) : null}
      {send ? <SendText title={t('common.share')} text={`${t('d.church.onPod', { track: item.title + (item.artist ? ' · ' + item.artist : '') })}\n${podLink(item.id)}`} onClose={() => setSend(false)} /> : null}
    </div>
  );
}

/* ---------- Add to Pod ---------- */

type Errors = { title?: string; artist?: string; audio?: string; form?: string };

/** Accepts a web address. Anything else is null. */
function audioLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[\w.-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(url) ? url : null;
}

/** Reads how long a sound is. 0 when it can't be read (a slow link, a stream, or not audio); never fails. */
function probeDuration(url: string, ms = 10000): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    let done = false;
    const finish = (s: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      resolve(Number.isFinite(s) && s > 0 ? Math.round(s) : 0);
    };
    const timer = setTimeout(() => finish(0), ms);
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => finish(a.duration));
    a.addEventListener('error', () => finish(0));
    a.src = url;
  });
}

/** Adding a song or a podcast episode: an audio file (or a link to one), title, artist or host, cover. */
function AddToPod({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const canAdd = !!me.plus || !!me.admin_role;
  const [kind, setKind] = useState<PodItem['kind']>('song');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [link, setLink] = useState('');
  const [cover, setCover] = useState<{ url: string; width: number } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState('');
  const audioInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const song = kind === 'song';

  const pickAudio = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(f.name)) {
      setErrors({ audio: t('d.church.audioOnly') });
      return;
    }
    const url = URL.createObjectURL(f);
    rememberSize(url, f.size);
    setFile({ url, name: f.name });
    setErrors((e) => ({ ...e, audio: undefined }));
    // A title from the file's name, if none is typed yet.
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 160));
  };
  const pickCover = async (f?: File) => {
    if (!f || !f.type.startsWith('image/')) return;
    const url = URL.createObjectURL(f);
    rememberSize(url, f.size);
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
    setCover({ url, width: img.naturalWidth });
  };

  async function save() {
    if (step) return;
    const name = title.trim();
    const a = artist.trim();
    const url = file?.url ?? audioLink(link);
    const errs: Errors = {};
    if (name.length < 2) errs.title = song ? t('d.church.songTitle') : t('d.church.episodeTitle');
    if (!a) errs.artist = song ? t('d.church.whoBy') : t('d.church.whoHosts');
    if (!url) errs.audio = t('d.church.audioNeeded');
    setErrors(errs);
    if (!url || errs.title || errs.artist) return;
    try {
      setStep(t('d.church.readingAudio'));
      const duration = await probeDuration(url);
      if (!duration && !file && !/\.(mp3|m4a|aac|wav|ogg|oga|flac|mp4)(\?|#|$)/i.test(url)) {
        setErrors({ audio: t('d.church.linkNotAudio') });
        setStep('');
        return;
      }
      // Files are uploaded only now, so closing the form leaves nothing behind in storage.
      let audio_url = url;
      if (file) {
        setStep(t('d.church.uploadingAudio'));
        audio_url = await uploadAudio(me.id, file.url);
      }
      let cover_url = '';
      if (cover) {
        setStep(t('create.uploadingCover'));
        cover_url = (await uploadImage(me.id, cover.url, cover.width, 1200)).url;
      }
      setStep(t('d.church.saving'));
      const item = await addPodItem(me.id, { kind, title: name, artist: a, description: song ? '' : description, cover_url, audio_url, duration_seconds: duration });
      toast(t('d.church.addedToPod'));
      nav('/pod/' + item.id);
    } catch (e) {
      setErrors({ form: errText(e) });
      setStep('');
    }
  }

  if (!canAdd) {
    return (
      <Modal onClose={onClose} title={t('d.church.addToPod')}>
        <Empty icon="headphones" title={t('d.church.podPlusOnly')}>
          <Link to="/plus" className="btn">
            {t('d.church.seePlus')}
          </Link>
        </Empty>
      </Modal>
    );
  }
  const busy = !!step;
  return (
    <Modal onClose={() => !busy && onClose()} title={t('d.church.addToPod')} wide closeOutside={!busy} className="ch-add">
      <div className="form-pad">
        <div className="seg left ch-add-kind" role="radiogroup" aria-label={t('d.church.kind')}>
          {(['song', 'podcast'] as const).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)} disabled={busy}>
              {k === 'song' ? t('d.church.song') : t('d.church.episode')}
            </button>
          ))}
        </div>
        <div className="ch-add-top">
          <button className="ch-add-cover" onClick={() => coverInput.current?.click()} disabled={busy} aria-label={cover ? t('d.church.changeCover') : t('d.church.addCover')}>
            {cover ? <img src={cover.url} alt="" /> : <Icon name={song ? 'music' : 'podcast'} size={36} />}
            <span className="ch-add-cam">
              <Icon name="camera" size={14} color="#fff" />
            </span>
          </button>
          <input ref={coverInput} type="file" accept="image/*" hidden data-testid="pod-cover" onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="grow">
            <b>{t('d.church.cover')}</b>
            {cover ? (
              <button className="link-btn danger" onClick={() => setCover(null)} disabled={busy}>
                {t('noteNew.removePlace')}
              </button>
            ) : null}
          </div>
        </div>
        <div className="form-row">
          {t('create.audio')}
          <div className="ch-audio-pick">
            <button className="btn quiet" onClick={() => audioInput.current?.click()} disabled={busy}>
              <Icon name="music" size={16} /> {file ? t('d.church.chooseAnotherFile') : t('d.church.chooseAudio')}
            </button>
            {file ? <span className="ch-file-name">{file.name}</span> : null}
            <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" hidden data-testid="pod-audio" onChange={(e) => { pickAudio(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {file ? null : <input type="url" value={link} onChange={(e) => { setLink(e.target.value); setErrors((x) => ({ ...x, audio: undefined })); }} placeholder={t('d.church.audioLinkPlaceholder')} aria-label={t('d.church.audioLink')} maxLength={1000} disabled={busy} />}
          {errors.audio ? <span className="form-error">{errors.audio}</span> : null}
        </div>
        <label className="form-row">
          {t('ssPub.title')}
          <input value={title} onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, title: undefined })); }} placeholder={song ? t('d.church.songPlaceholder') : t('d.church.episodePlaceholder')} maxLength={160} disabled={busy} />
          {errors.title ? <span className="form-error">{errors.title}</span> : null}
        </label>
        <label className="form-row">
          {song ? t('d.church.artist') : t('d.church.host')}
          <input value={artist} onChange={(e) => { setArtist(e.target.value); setErrors((x) => ({ ...x, artist: undefined })); }} placeholder={song ? t('d.church.whoSings') : t('d.church.whoPresents')} maxLength={160} disabled={busy} />
          {errors.artist ? <span className="form-error">{errors.artist}</span> : null}
        </label>
        {song ? null : (
          <label className="form-row">
            {t('d.church.aboutEpisode')}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('d.church.aboutEpisodePlaceholder')} maxLength={2000} rows={4} disabled={busy} />
          </label>
        )}
        {errors.form ? <p className="form-error">{errors.form}</p> : null}
        <button className="btn big block" onClick={save} disabled={busy}>
          {busy ? step : t('d.church.addToPod')}
        </button>
      </div>
    </Modal>
  );
}
