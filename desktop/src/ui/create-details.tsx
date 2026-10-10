// The last step of "Create new post": the caption and everything that can go with a post (database
// v20), down the right-hand side like Instagram's: a poll, a prompt, tagged people, a place, alt text,
// the AI label, who can see it, and the advanced settings (hide the like count, turn off commenting,
// keep it to your profile, mark it sensitive). The iPhone's screen is app/(app)/create.tsx with the
// pieces in src/components/PostComposer.tsx; the rules and wording are the same.
import React, { useEffect, useRef, useState } from 'react';
import { searchProfiles } from 'shared/api';
import type { PostPoll, Profile } from 'shared/types';
import '../styles/posts.css';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, type IconName, Spinner, Verified, toast, toastError } from './kit';
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
};

export const NO_EXTRAS: Extras = { tagged: [], poll: null, prompt: null, ai: false, subscribersOnly: false, hideLikes: false, commentsOff: false, profileOnly: false, sensitive: false, asShort: true, alts: [] };

/** The poll as it will be saved, or an error when it has fewer than two options with words in them. */
export function cleanPoll(poll: PostPoll | null): { poll: PostPoll | null; error?: string } {
  if (!poll) return { poll: null };
  const options = poll.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) return { poll: null, error: 'A poll needs at least two options.' };
  return { poll: { question: (poll.question ?? '').trim(), options } };
}

type Thumb = { url: string; type: 'image' | 'video' };

export function DetailsPanel({ mode, items, caption, setCaption, location, setLocation, extras, set, busy, error }: { mode: 'post' | 'short'; items: Thumb[]; caption: string; setCaption: (v: string) => void; location: string; setLocation: (v: string) => void; extras: Extras; set: (patch: Partial<Extras>) => void; busy: boolean; error: string }) {
  const { me } = useMe();
  const [open, setOpen] = useState<'' | 'tags' | 'alt' | 'advanced'>('');
  const area = useRef<HTMLTextAreaElement>(null);
  const toggle = (k: typeof open) => setOpen(open === k ? '' : k);
  const singleVideo = items.length === 1 && items[0].type === 'video';
  // Only creators who offer a subscription can keep a post for their subscribers.
  const canLimit = !!me.sub_price_pence;
  const photos = items.map((it, i) => ({ ...it, i })).filter((it) => it.type === 'image');
  return (
    <div className="create-side pp-details">
      <div className="who">
        <Avatar src={me.avatar_url} name={me.username} size={28} />
        <b>{me.username}</b>
      </div>
      <textarea ref={area} className="pp-caption" placeholder="Write a caption…" value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" autoFocus disabled={busy} />
      <div className="pp-count-row">
        <EmojiButton onPick={(e) => insertAt(area.current, caption, e, setCaption)} />
        <span className="pp-count-text">{caption.length.toLocaleString()}/2,200</span>
      </div>

      <div className="pp-chips">
        <button type="button" className={'pp-chip' + (extras.poll ? ' on' : '')} aria-pressed={!!extras.poll} disabled={busy} onClick={() => set({ poll: extras.poll ? null : { question: '', options: ['', ''] } })}>
          <PollIcon size={15} />
          Poll
        </button>
        <button type="button" className={'pp-chip' + (extras.prompt !== null ? ' on' : '')} aria-pressed={extras.prompt !== null} disabled={busy} onClick={() => set({ prompt: extras.prompt === null ? '' : null })}>
          <Icon name="chatdots" size={15} stroke={2} />
          Prompt
        </button>
      </div>
      {extras.poll ? <PollEditor poll={extras.poll} onChange={(poll) => set({ poll })} onRemove={() => set({ poll: null })} /> : null}
      {extras.prompt !== null ? (
        <EditCard icon={<Icon name="chatdots" size={16} stroke={2} />} title="Prompt" onRemove={() => set({ prompt: null })}>
          <textarea className="pp-field" value={extras.prompt} maxLength={200} rows={2} autoFocus placeholder="Ask something others can answer…" aria-label="Prompt" onChange={(e) => set({ prompt: e.target.value })} />
          <span className="pp-field-note">People answer in the comments.</span>
        </EditCard>
      ) : null}

      <Section icon="tagged" title="Tag people" value={extras.tagged.length ? String(extras.tagged.length) : ''} open={open === 'tags'} onToggle={() => toggle('tags')}>
        <TagPicker tagged={extras.tagged} onChange={(tagged) => set({ tagged })} />
      </Section>
      {extras.tagged.length && open !== 'tags' ? <PeopleChips people={extras.tagged} onRemove={(p) => set({ tagged: extras.tagged.filter((x) => x.id !== p.id) })} /> : null}
      <label className="side-row pp-side-row">
        <input placeholder="Add location" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} aria-label="Location" disabled={busy} />
        {location ? (
          <button type="button" className="icon-btn tiny" aria-label="Clear place" onClick={() => setLocation('')}>
            <Icon name="close" size={14} />
          </button>
        ) : (
          <Icon name="location" size={18} />
        )}
      </label>
      <SwitchRow title="AI label" sub="Say it was made or changed with AI" on={extras.ai} onChange={(ai) => set({ ai })} disabled={busy} />
      {canLimit ? (
        <div className="pp-audience">
          <span>Audience</span>
          <div className="pp-seg" role="radiogroup" aria-label="Audience">
            <button type="button" role="radio" aria-checked={!extras.subscribersOnly} className={!extras.subscribersOnly ? 'on' : ''} onClick={() => set({ subscribersOnly: false })}>
              Everyone
            </button>
            <button type="button" role="radio" aria-checked={extras.subscribersOnly} className={extras.subscribersOnly ? 'on' : ''} onClick={() => set({ subscribersOnly: true })}>
              <Icon name="lock" size={12} stroke={2.4} /> Subscribers only
            </button>
          </div>
        </div>
      ) : null}
      {mode === 'post' && singleVideo ? <SwitchRow title="Share as a Short" sub="Shown in Shorts as well as on your profile" on={extras.asShort} onChange={(asShort) => set({ asShort })} disabled={busy} /> : null}
      {photos.length ? (
        <Section icon="eye" title="Accessibility" value={extras.alts.some((a) => a.trim()) ? 'Alt text added' : ''} open={open === 'alt'} onToggle={() => toggle('alt')}>
          <p className="pp-sec-note">Alt text describes your photos for people with visual impairments.</p>
          {photos.map((p) => (
            <label key={p.i} className="pp-alt-row">
              <img src={p.url} alt="" />
              <input value={extras.alts[p.i] ?? ''} maxLength={300} placeholder="Write alt text…" aria-label={`Alt text for photo ${p.i + 1}`} onChange={(e) => set({ alts: items.map((_, j) => (j === p.i ? e.target.value : extras.alts[j] ?? '')) })} />
            </label>
          ))}
        </Section>
      ) : null}
      <Section icon="sliders" title="Advanced settings" open={open === 'advanced'} onToggle={() => toggle('advanced')}>
        <SwitchRow title="Hide like count" sub="Only you will see the total number of likes on this post." on={extras.hideLikes} onChange={(hideLikes) => set({ hideLikes })} />
        <SwitchRow title="Turn off commenting" sub="Nobody but you can comment. You can change this later from the … menu." on={extras.commentsOff} onChange={(commentsOff) => set({ commentsOff })} />
        {/* Kept to the profile: Plus members switch it on; everyone else is shown where to get it. */}
        {me.plus ? (
          <SwitchRow title="Only post to profile" sub="Kept off feeds, Shorts and Explore." on={extras.profileOnly} onChange={(profileOnly) => set({ profileOnly })} />
        ) : (
          <button type="button" className="pp-switch-row" onClick={() => nav('/plus')}>
            <span className="pp-switch-text">
              <span>Only post to profile</span>
              <small>Part of Community Plus</small>
            </span>
            <span className="pp-accent">Try Community Plus</span>
          </button>
        )}
        <SwitchRow title="Mark as sensitive" sub="Hidden from members under 14, and covered for everyone else until they choose to see it." on={extras.sensitive} onChange={(sensitive) => set({ sensitive })} />
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

/** A card under the caption with a title and a way to take it off again. */
function EditCard({ icon, title, onRemove, children }: { icon: React.ReactNode; title: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="pp-edit-card">
      <div className="pp-edit-card-head">
        <span className="pp-accent">{icon}</span>
        <b className="grow">{title}</b>
        <button type="button" className="icon-btn tiny" aria-label={'Remove ' + title.toLowerCase()} onClick={onRemove}>
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
    <EditCard icon={<PollIcon size={16} />} title="Poll" onRemove={onRemove}>
      <input className="pp-field strong" value={poll.question ?? ''} maxLength={140} placeholder="Ask a question (optional)" aria-label="Poll question" onChange={(e) => onChange({ ...poll, question: e.target.value })} />
      {poll.options.map((o, i) => (
        <div key={i} className="pp-option">
          <input className="pp-field" value={o} maxLength={80} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} onChange={(e) => setOption(i, e.target.value)} />
          {poll.options.length > 2 ? (
            <button type="button" className="icon-btn tiny" aria-label={`Remove option ${i + 1}`} onClick={() => onChange({ ...poll, options: poll.options.filter((_, j) => j !== i) })}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
      ))}
      {poll.options.length < 4 ? (
        <button type="button" className="pp-add-option" onClick={() => onChange({ ...poll, options: [...poll.options, ''] })}>
          <Icon name="plus" size={14} stroke={2.4} /> Add option
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
        <button key={p.id} type="button" className="pp-person-chip" aria-label={`Remove ${p.username}`} onClick={() => onRemove(p)}>
          <Avatar src={p.avatar_url} name={p.username} size={22} />
          <span>{p.username}</span>
          <Icon name="close" size={12} stroke={2.4} />
        </button>
      ))}
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
    else if (tagged.length >= MAX_TAGS) toast(`You can tag up to ${MAX_TAGS} people.`);
    else onChange([...tagged, p]);
  };
  return (
    <div className="pp-tag-picker">
      {tagged.length ? <PeopleChips people={tagged} onRemove={flip} /> : null}
      <label className="pp-search">
        <Icon name="search" size={16} />
        <input autoFocus value={q} placeholder="Search people" aria-label="Search people to tag" onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="pp-tag-results">
        {people === null ? <Spinner size={22} /> : null}
        {people && !people.length ? <p className="muted-text small center pad">No one found</p> : null}
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
