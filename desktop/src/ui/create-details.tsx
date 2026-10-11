// The last step of "Create new post": the caption and everything that can go with a post (database
// v20), down the right-hand side like Instagram's: a poll, a prompt, a song from Pod, tagged people, a
// place, alt text, the AI label, where it goes (your profile, or a community or page you can post in),
// who can see it, also sharing it to your story, and the advanced settings (hide the like count, turn
// off commenting, keep it to your profile, mark it sensitive). The iPhone's screen is
// app/(app)/create.tsx with the pieces in src/components/PostComposer.tsx; the rules and wording are
// the same.
import React, { useEffect, useRef, useState } from 'react';
import { canPostIn, fetchMyGroups, fetchPod, fetchPopularPod, searchProfiles } from 'shared/api';
import { clock } from 'shared/theme';
import type { Group, PodItem, PostPoll, Profile } from 'shared/types';
import '../styles/posts.css';
import { dateLocale, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, type IconName, Spinner, Verified, toast, toastError } from './kit';
import { usePlayer } from './player';
import { EmojiButton, PollIcon, insertAt } from './post-extras';

/** Most people a post can tag (the database keeps to the same). */
export const MAX_TAGS = 20;

export type Extras = {
  tagged: Profile[];
  /** null: no poll card. */
  poll: PostPoll | null;
  /** null: no prompt card. */
  prompt: string | null;
  ai: boolean;
  subscribersOnly: boolean;
  hideLikes: boolean;
  commentsOff: boolean;
  profileOnly: boolean;
  sensitive: boolean;
  /** A single video chosen under Post: share it as a Short (the default, as the shared code does). */
  asShort: boolean;
  /** Alt text for each photo, in the same order as the photos. */
  alts: string[];
  /** Post into this community or page; null: your profile. */
  groupId: string | null;
  /** A song from Pod that plays with the post; null for none. */
  song: PodItem | null;
  /** Also put the first photo or video on your story once the post is shared. */
  toStory: boolean;
};

export const NO_EXTRAS: Extras = { tagged: [], poll: null, prompt: null, ai: false, subscribersOnly: false, hideLikes: false, commentsOff: false, profileOnly: false, sensitive: false, asShort: true, alts: [], groupId: null, song: null, toStory: false };

/** The communities and pages I may post in (any member of a community; owners and admins of a page). */
export function usePostableGroups(): Group[] {
  const { me } = useMe();
  const [groups, setGroups] = useState<Group[]>([]);
  useEffect(() => {
    let live = true;
    fetchMyGroups(me.id).then(
      (all) => live && setGroups(all.filter(canPostIn)),
      () => live && setGroups([]),
    );
    return () => {
      live = false;
    };
  }, [me.id]);
  return groups;
}

/**
 * The rules that change with where the post goes, as on the iPhone: only a post on your own profile
 * can be kept for your subscribers or kept off feeds (Plus), and only a post everyone who sees your
 * stories may see can go on your story too.
 */
export function placeRules(extras: Extras, me: Pick<Profile, 'sub_price_pence' | 'plus'>) {
  const canLimit = !!me.sub_price_pence && !extras.groupId;
  return {
    canLimit,
    canProfileOnly: !!me.plus && !extras.groupId,
    canStory: !extras.groupId && !(canLimit && extras.subscribersOnly),
  };
}

/** The poll as it will be saved, or an error when it has fewer than two options with words in them. */
export function cleanPoll(poll: PostPoll | null): { poll: PostPoll | null; error?: string } {
  if (!poll) return { poll: null };
  const options = poll.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) return { poll: null, error: t('createFlow.pollNeedsTwo') };
  return { poll: { question: (poll.question ?? '').trim(), options } };
}

type Thumb = { url: string; type: 'image' | 'video' };

export function DetailsPanel({ mode, items, caption, setCaption, location, setLocation, extras, set, busy, error }: { mode: 'post' | 'short'; items: Thumb[]; caption: string; setCaption: (v: string) => void; location: string; setLocation: (v: string) => void; extras: Extras; set: (patch: Partial<Extras>) => void; busy: boolean; error: string }) {
  const { me } = useMe();
  const [open, setOpen] = useState<'' | 'song' | 'tags' | 'place' | 'alt' | 'advanced'>('');
  const area = useRef<HTMLTextAreaElement>(null);
  const toggle = (k: typeof open) => setOpen(open === k ? '' : k);
  const singleVideo = items.length === 1 && items[0].type === 'video';
  const groups = usePostableGroups();
  const group = groups.find((g) => g.id === extras.groupId) ?? null;
  // Only creators who offer a subscription can keep a post for their subscribers, and only on their own profile.
  const { canLimit, canStory } = placeRules(extras, me);
  const photos = items.map((it, i) => ({ ...it, i })).filter((it) => it.type === 'image');
  return (
    <div className="create-side pp-details">
      <div className="who">
        <Avatar src={me.avatar_url} name={me.username} size={28} />
        <b>{me.username}</b>
      </div>
      <textarea ref={area} className="pp-caption" placeholder={t('create.captionPlaceholder')} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} aria-label={t('create.caption')} autoFocus disabled={busy} />
      <div className="pp-count-row">
        <EmojiButton onPick={(e) => insertAt(area.current, caption, e, setCaption)} />
        <span className="pp-count-text">{caption.length.toLocaleString(dateLocale())}/{(2200).toLocaleString(dateLocale())}</span>
      </div>

      <div className="pp-chips">
        <button type="button" className={'pp-chip' + (extras.poll ? ' on' : '')} aria-pressed={!!extras.poll} disabled={busy} onClick={() => set({ poll: extras.poll ? null : { question: '', options: ['', ''] } })}>
          <PollIcon size={15} />
          {t('createFlow.poll')}
        </button>
        <button type="button" className={'pp-chip' + (extras.prompt !== null ? ' on' : '')} aria-pressed={extras.prompt !== null} disabled={busy} onClick={() => set({ prompt: extras.prompt === null ? '' : null })}>
          <Icon name="chatdots" size={15} stroke={2} />
          {t('createFlow.prompt')}
        </button>
      </div>
      {extras.poll ? <PollEditor poll={extras.poll} onChange={(poll) => set({ poll })} onRemove={() => set({ poll: null })} /> : null}
      {extras.prompt !== null ? (
        <EditCard icon={<Icon name="chatdots" size={16} stroke={2} />} title={t('createFlow.prompt')} removeLabel={t('d.posts.removePrompt')} onRemove={() => set({ prompt: null })}>
          <textarea className="pp-field" value={extras.prompt} maxLength={200} rows={2} autoFocus placeholder={t('createFlow.promptPlaceholder')} aria-label={t('createFlow.prompt')} onChange={(e) => set({ prompt: e.target.value })} />
        </EditCard>
      ) : null}

      <Section icon="music" title={t('d.posts.addMusic')} value={extras.song ? extras.song.title : ''} open={open === 'song'} onToggle={() => toggle('song')}>
        <SongPicker selected={extras.song} onPick={(song) => { set({ song }); setOpen(''); }} />
      </Section>
      {extras.song && open !== 'song' ? <SongChip song={extras.song} onRemove={() => set({ song: null })} /> : null}
      <Section icon="tagged" title={t('createFlow.tagPeople')} value={extras.tagged.length ? String(extras.tagged.length) : ''} open={open === 'tags'} onToggle={() => toggle('tags')}>
        <TagPicker tagged={extras.tagged} onChange={(tagged) => set({ tagged })} />
      </Section>
      {extras.tagged.length && open !== 'tags' ? <PeopleChips people={extras.tagged} onRemove={(p) => set({ tagged: extras.tagged.filter((x) => x.id !== p.id) })} /> : null}
      <label className="side-row pp-side-row">
        <input placeholder={t('create.addLocation')} value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} aria-label={t('create.location')} disabled={busy} />
        {location ? (
          <button type="button" className="icon-btn tiny" aria-label={t('d.posts.clearPlace')} onClick={() => setLocation('')}>
            <Icon name="close" size={14} />
          </button>
        ) : (
          <Icon name="location" size={18} />
        )}
      </label>
      <SwitchRow title={t('createFlow.aiLabel')} on={extras.ai} onChange={(ai) => set({ ai })} disabled={busy} />
      {/* Where it goes: your profile, or a community or page you can post in (a group's Post button picks it). */}
      {groups.length || extras.groupId ? (
        <Section icon={group ? (group.kind === 'page' ? 'crown' : 'users') : 'user'} title={t('create.postTo')} value={group ? group.name : extras.groupId ? '' : t('create.yourProfile')} open={open === 'place'} onToggle={() => toggle('place')}>
          <div className="pp-place-list" role="radiogroup" aria-label={t('create.postTo')}>
            {[{ id: null as string | null, name: t('create.yourProfile'), sub: t('create.everyoneWhoFollows'), icon: 'user' as IconName }, ...groups.map((g) => ({ id: g.id as string | null, name: g.name, sub: t(g.kind === 'page' ? 'create.page' : g.privacy === 'private' ? 'create.privateCommunity' : 'create.community'), icon: (g.kind === 'page' ? 'crown' : 'users') as IconName }))].map((o) => (
              <button
                key={o.id ?? 'me'}
                type="button"
                role="radio"
                aria-checked={extras.groupId === o.id}
                aria-label={o.name}
                className="pp-place-row"
                disabled={busy}
                onClick={() => {
                  // A post in a community or page is for its members: it can't be kept for subscribers, to your profile or go on your story.
                  set(o.id ? { groupId: o.id, subscribersOnly: false, profileOnly: false, toStory: false } : { groupId: null });
                  setOpen('');
                }}
              >
                <span className="pp-place-icon">
                  <Icon name={o.icon} size={18} />
                </span>
                <span className="row-text">
                  <b>{o.name}</b>
                  <span>{o.sub}</span>
                </span>
                <span className={'pp-check' + (extras.groupId === o.id ? ' on' : '')}>{extras.groupId === o.id ? <Icon name="check" size={13} stroke={3} color="#fff" /> : null}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : null}
      {canLimit ? (
        <div className="pp-audience">
          <span>{t('createFlow.audience')}</span>
          <div className="pp-seg" role="radiogroup" aria-label={t('createFlow.audience')}>
            <button type="button" role="radio" aria-checked={!extras.subscribersOnly} className={!extras.subscribersOnly ? 'on' : ''} onClick={() => set({ subscribersOnly: false })}>
              {t('createFlow.everyone')}
            </button>
            <button type="button" role="radio" aria-checked={extras.subscribersOnly} className={extras.subscribersOnly ? 'on' : ''} onClick={() => set({ subscribersOnly: true })}>
              <Icon name="lock" size={12} stroke={2.4} /> {t('create.subscribersOnly')}
            </button>
          </div>
        </div>
      ) : null}
      {mode === 'post' && singleVideo ? <SwitchRow title={t('d.posts.shareAsShort')} on={extras.asShort} onChange={(asShort) => set({ asShort })} disabled={busy} /> : null}
      {canStory ? <SwitchRow title={t('createFlow.alsoStory')} on={extras.toStory} onChange={(toStory) => set({ toStory })} disabled={busy} /> : null}
      {photos.length ? (
        <Section icon="eye" title={t('d.posts.accessibility')} value={extras.alts.some((a) => a.trim()) ? t('d.posts.altAdded') : ''} open={open === 'alt'} onToggle={() => toggle('alt')}>
          {photos.map((p) => (
            <label key={p.i} className="pp-alt-row">
              <img src={p.url} alt="" />
              <input value={extras.alts[p.i] ?? ''} maxLength={300} placeholder={t('d.posts.writeAlt')} aria-label={t('d.posts.altFor', { n: p.i + 1 })} onChange={(e) => set({ alts: items.map((_, j) => (j === p.i ? e.target.value : extras.alts[j] ?? '')) })} />
            </label>
          ))}
        </Section>
      ) : null}
      <Section icon="sliders" title={t('d.posts.advanced')} open={open === 'advanced'} onToggle={() => toggle('advanced')}>
        <SwitchRow title={t('createFlow.hideLikes')} on={extras.hideLikes} onChange={(hideLikes) => set({ hideLikes })} />
        <SwitchRow title={t('createFlow.commentsOff')} on={extras.commentsOff} onChange={(commentsOff) => set({ commentsOff })} />
        {/* Kept to the profile: Plus members switch it on; everyone else is shown where to get it. Not for a post in a group. */}
        {extras.groupId ? null : me.plus ? (
          <SwitchRow title={t('createFlow.profileOnly')} on={extras.profileOnly} onChange={(profileOnly) => set({ profileOnly })} />
        ) : (
          <button type="button" className="pp-switch-row" onClick={() => nav('/plus')}>
            <span className="pp-switch-text">
              <span>{t('createFlow.profileOnly')}</span>
              <small>{t('d.posts.partOfPlus')}</small>
            </span>
            <span className="pp-accent">{t('createFlow.tryPlus')}</span>
          </button>
        )}
        <SwitchRow title={t('d.posts.markSensitive')} on={extras.sensitive} onChange={(sensitive) => set({ sensitive })} />
      </Section>
      {error ? (
        <p className="form-error pp-share-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- pieces ---------- */

/** A row that opens to show more, like Instagram's "Accessibility" and "Advanced settings". */
function Section({ icon, title, value, open, onToggle, children }: { icon: IconName; title: string; value?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={'pp-sec' + (open ? ' open' : '')}>
      <button type="button" className="pp-sec-head" aria-expanded={open} onClick={onToggle}>
        <Icon name={icon} size={20} />
        <span className="grow">{title}</span>
        {value ? <span className="pp-sec-value">{value}</span> : null}
        <Icon name="down" size={16} className="pp-chev" />
      </button>
      {open ? <div className="pp-sec-body">{children}</div> : null}
    </div>
  );
}

/** A row with a switch; the whole row flips it. */
export function SwitchRow({ title, sub, on, onChange, disabled }: { title: string; sub?: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={title} className="pp-switch-row" disabled={disabled} onClick={() => onChange(!on)}>
      <span className="pp-switch-text">
        <span>{title}</span>
        {sub ? <small>{sub}</small> : null}
      </span>
      <span className={'pp-switch' + (on ? ' on' : '')} aria-hidden="true" />
    </button>
  );
}

/** A card under the caption with a title and a way to take it off again (`removeLabel` is read aloud on the cross). */
function EditCard({ icon, title, removeLabel, onRemove, children }: { icon: React.ReactNode; title: string; removeLabel: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="pp-edit-card">
      <div className="pp-edit-card-head">
        <span className="pp-accent">{icon}</span>
        <b className="grow">{title}</b>
        <button type="button" className="icon-btn tiny" aria-label={removeLabel} onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}

/** The poll being written: an optional question and two to four options. */
function PollEditor({ poll, onChange, onRemove }: { poll: PostPoll; onChange: (p: PostPoll) => void; onRemove: () => void }) {
  const setOption = (i: number, text: string) => onChange({ ...poll, options: poll.options.map((o, j) => (j === i ? text : o)) });
  return (
    <EditCard icon={<PollIcon size={16} />} title={t('createFlow.poll')} removeLabel={t('d.posts.removePoll')} onRemove={onRemove}>
      <input className="pp-field strong" value={poll.question ?? ''} maxLength={140} placeholder={t('createFlow.pollQuestion')} aria-label={t('d.posts.pollQuestion')} onChange={(e) => onChange({ ...poll, question: e.target.value })} />
      {poll.options.map((o, i) => (
        <div key={i} className="pp-option">
          <input className="pp-field" value={o} maxLength={80} placeholder={t('createFlow.pollOption', { n: i + 1 })} aria-label={t('createFlow.pollOption', { n: i + 1 })} onChange={(e) => setOption(i, e.target.value)} />
          {poll.options.length > 2 ? (
            <button type="button" className="icon-btn tiny" aria-label={t('createFlow.removeOption', { n: i + 1 })} onClick={() => onChange({ ...poll, options: poll.options.filter((_, j) => j !== i) })}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
      ))}
      {poll.options.length < 4 ? (
        <button type="button" className="pp-add-option" onClick={() => onChange({ ...poll, options: [...poll.options, ''] })}>
          <Icon name="plus" size={14} stroke={2.4} /> {t('createFlow.addOption')}
        </button>
      ) : null}
    </EditCard>
  );
}

/** The people tagged so far; clicking one takes them off. */
function PeopleChips({ people, onRemove }: { people: Profile[]; onRemove: (p: Profile) => void }) {
  return (
    <div className="pp-people-chips">
      {people.map((p) => (
        <button key={p.id} type="button" className="pp-person-chip" aria-label={t('createFlow.untag', { username: p.username })} onClick={() => onRemove(p)}>
          <Avatar src={p.avatar_url} name={p.username} size={22} />
          <span>{p.username}</span>
          <Icon name="close" size={12} stroke={2.4} />
        </button>
      ))}
    </div>
  );
}

/* ---------- a song from Pod ---------- */

/** A song's cover, or a note when it has none. */
function Cover({ song, size }: { song: PodItem; size: number }) {
  return song.cover_url ? <img className="pp-cover" src={song.cover_url} alt="" style={{ width: size, height: size }} /> : <span className="pp-cover" style={{ width: size, height: size }}><Icon name="music" size={size * 0.5} /></span>;
}

/** The song chosen, under Add music; the cross takes it off. */
function SongChip({ song, onRemove }: { song: PodItem; onRemove: () => void }) {
  return (
    <div className="pp-song-chip-row">
      <span className="pp-song-chip">
        <Cover song={song} size={26} />
        <span className="pp-song-chip-text">
          <b>{song.title}</b>
          {song.artist ? <span>{song.artist}</span> : null}
        </span>
        <button type="button" className="icon-btn tiny" aria-label={t('d.posts.removeMusic')} onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      </span>
    </div>
  );
}

/**
 * Add music: the songs on Pod, searchable, with the most played and newest first while the search is
 * empty (the iPhone's song strip and song sheet). The round button plays a song in the app's player
 * to listen first; clicking the row picks it.
 */
function SongPicker({ selected, onPick }: { selected: PodItem | null; onPick: (song: PodItem | null) => void }) {
  const player = usePlayer();
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<PodItem[] | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        const needle = q.trim();
        const ask = needle
          ? fetchPod('song', needle)
          : Promise.all([fetchPopularPod(16).catch(() => [] as PodItem[]), fetchPod('song')]).then(([popular, recent]) => {
              const seen = new Set<string>();
              return [...popular.filter((p) => p.kind === 'song'), ...recent].filter((s) => !seen.has(s.id) && !!seen.add(s.id)).slice(0, 10);
            });
        ask.then(
          (r) => live && setSongs(r.filter((s) => !!s.audio_url)),
          (e) => {
            if (!live) return;
            setSongs([]);
            toastError(e);
          },
        );
      },
      q ? 220 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
  return (
    <div className="pp-song-picker">
      <label className="pp-search">
        <Icon name="search" size={16} />
        <input autoFocus value={q} placeholder={t('createFlow.searchSongs')} aria-label={t('createFlow.searchSongs')} onChange={(e) => setQ(e.target.value)} />
      </label>
      {selected ? (
        <button type="button" className="pp-tag-row pp-song-off" onClick={() => onPick(null)}>
          <span className="pp-cover" style={{ width: 36, height: 36 }}>
            <Icon name="mute" size={18} />
          </span>
          <b>{t('d.posts.removeMusic')}</b>
        </button>
      ) : null}
      <div className="pp-tag-results">
        {songs === null ? <Spinner size={22} /> : null}
        {songs && !songs.length ? <p className="muted-text small center pad">{t('createFlow.noSongs')}</p> : null}
        {(songs ?? []).map((s) => {
          const on = selected?.id === s.id;
          const playing = player.item?.id === s.id && player.playing;
          return (
            <div key={s.id} className={'pp-song-row' + (on ? ' on' : '')}>
              <button type="button" className="pp-song-play" aria-label={t(playing ? 'd.posts.pauseSong' : 'd.posts.listenTo', { song: s.title })} onClick={() => player.play(s)}>
                <Cover song={s} size={36} />
                <span className="pp-song-play-icon">
                  <Icon name={playing ? 'pause' : 'play'} size={14} color="#fff" stroke={0} />
                </span>
              </button>
              <button type="button" role="radio" aria-checked={on} aria-label={`${s.title}, ${s.artist}`} className="pp-song-pick" onClick={() => onPick(s)}>
                <span className="row-text">
                  <b>{s.title}</b>
                  <span>
                    {s.artist}
                    {s.duration_seconds ? ` · ${clock(s.duration_seconds)}` : ''}
                  </span>
                </span>
                {on ? <Icon name="check" size={18} stroke={2.4} className="pp-accent" /> : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Find members and tag them (up to 20). */
function TagPicker({ tagged, onChange }: { tagged: Profile[]; onChange: (list: Profile[]) => void }) {
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        searchProfiles(q).then(
          (r) => live && setPeople(r.filter((p) => p.id !== me.id && !p.suspended && !p.deleted_at)),
          (e) => {
            if (!live) return;
            setPeople([]);
            toastError(e);
          },
        );
      },
      q ? 220 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, me.id]);
  const flip = (p: Profile) => {
    if (tagged.some((x) => x.id === p.id)) onChange(tagged.filter((x) => x.id !== p.id));
    else if (tagged.length >= MAX_TAGS) toast(t('createFlow.tooManyTags', { count: MAX_TAGS }));
    else onChange([...tagged, p]);
  };
  return (
    <div className="pp-tag-picker">
      {tagged.length ? <PeopleChips people={tagged} onRemove={flip} /> : null}
      <label className="pp-search">
        <Icon name="search" size={16} />
        <input autoFocus value={q} placeholder={t('createFlow.searchPeople')} aria-label={t('d.posts.searchPeopleToTag')} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="pp-tag-results">
        {people === null ? <Spinner size={22} /> : null}
        {people && !people.length ? <p className="muted-text small center pad">{t('createFlow.noPeople')}</p> : null}
        {(people ?? []).slice(0, 8).map((p) => {
          const on = tagged.some((x) => x.id === p.id);
          return (
            <button key={p.id} type="button" role="checkbox" aria-checked={on} className="pp-tag-row" onClick={() => flip(p)}>
              <Avatar src={p.avatar_url} name={p.username} size={32} />
              <span className="row-text">
                <b>
                  {p.username}
                  {p.verified ? <Verified size={11} /> : null}
                </b>
                {p.full_name ? <span>{p.full_name}</span> : null}
              </span>
              <span className={'pp-check' + (on ? ' on' : '')}>{on ? <Icon name="check" size={13} stroke={3} color="#fff" /> : null}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
