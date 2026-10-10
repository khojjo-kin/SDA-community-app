// Small pieces the community, page and church screens share: how a group's size is written, its
// cover, the cover picker, the church picker, a person's row, and the Owner / Admin tag.
import React, { useRef } from 'react';
import { fetchChurches } from 'shared/api';
import { fmt } from 'shared/theme';
import type { Group, Profile } from 'shared/types';
import { nav } from '../lib/router';
import { Avatar, Icon, Link, Verified, toast, useLoad } from '../ui/kit';
import { townOf } from './church-parts';
import '../styles/community.css';

/** A picture chosen on this computer, not yet uploaded. */
export type Picked = { uri: string; width: number };

/** Same rule as the database's check on handles. */
export const HANDLE = /^[a-z0-9_.]{3,30}$/;

/** A taken handle comes back as a unique violation; errText would only say "That already exists". */
export function isTakenHandle(e: unknown): boolean {
  const anyE = e as { code?: string; message?: string } | null;
  return anyE?.code === '23505' || /duplicate key|unique/i.test(anyE?.message ?? '');
}

/** "Community · 240 members" or "Page · 1.2K followers". */
export function groupSub(g: Pick<Group, 'kind' | 'member_count'>): string {
  const word = g.kind === 'page' ? 'follower' : 'member';
  return `${g.kind === 'page' ? 'Page' : 'Community'} · ${fmt(g.member_count)} ${word}${g.member_count === 1 ? '' : 's'}`;
}

/** Whether I run this group (or, as an app admin, may run any). */
export const manages = (g: Pick<Group, 'my_standing'>, appAdmin: boolean) => g.my_standing === 'owner' || g.my_standing === 'admin' || appAdmin;

/** Posts in a private community are for its members; a public group shows them to everyone. App admins see everything. */
export const canSee = (g: Pick<Group, 'privacy' | 'my_standing'>, appAdmin: boolean) => g.privacy === 'public' || appAdmin || (g.my_standing !== null && g.my_standing !== 'pending');

/** A group's cover, or its kind's mark on a soft green ground when it has none. */
export function GroupCover({ g, className, size = 34 }: { g: Pick<Group, 'cover_url' | 'kind'>; className?: string; size?: number }) {
  return (
    <span className={'cm-cover ' + (className ?? '')}>
      {g.cover_url ? <img src={g.cover_url} alt="" loading="lazy" /> : <Icon name={g.kind === 'page' ? 'crown' : 'users'} size={size} stroke={1.6} />}
    </span>
  );
}

/** Choose a cover: click to pick a picture, or drop one on it. Nothing is uploaded until the form is saved. */
export function CoverPicker({ shown, onPick, onRemove, busy }: { shown: string; onPick: (p: Picked) => void; onRemove?: () => void; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const choose = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Choose a photo (JPG or PNG).');
    const uri = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => onPick({ uri, width: img.naturalWidth });
    img.onerror = () => toast('That picture could not be opened. Choose another.');
    img.src = uri;
  };
  return (
    <div className="cm-cover-field">
      <button
        type="button"
        className={'cm-cover-pick' + (shown ? ' has' : '')}
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={shown ? 'Change cover photo' : 'Add a cover photo'}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files?.[0]);
        }}
      >
        {shown ? <img src={shown} alt="" /> : null}
        <span className="cm-cover-label">
          <Icon name="image" size={20} /> {shown ? 'Change cover' : 'Add a cover photo'}
        </span>
        {shown ? null : <span className="cm-hint">Optional · click or drop a picture</span>}
      </button>
      {shown && onRemove ? (
        <button type="button" className="link-btn muted cm-cover-remove" disabled={busy} onClick={onRemove}>
          Remove cover
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Cover photo"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** The church a group belongs to, or none. Churches an admin turned down are not offered. */
export function ChurchSelect({ value, onChange, disabled }: { value: string; onChange: (id: string, name: string | null) => void; disabled?: boolean }) {
  const list = useLoad(() => fetchChurches(), []);
  const churches = (list.data ?? []).filter((c) => c.status !== 'rejected' || c.id === value);
  return (
    <label className="form-row">
      <span>Church</span>
      <select
        className="cm-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value, churches.find((c) => c.id === e.target.value)?.name ?? null)}
      >
        <option value="">No church</option>
        {churches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {townOf(c) ? ' · ' + townOf(c) : ''}
          </option>
        ))}
      </select>
      <span className="cm-hint">Optional: the church it belongs to.</span>
    </label>
  );
}

/** One person in a list: picture, username with the tick, name, and whatever goes on the right. */
export function PersonRow({ p, right, sub }: { p: Profile; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="cm-person">
      <Avatar src={p.avatar_url} name={p.username} size={44} onClick={() => nav('/u/' + p.username)} label={p.username} />
      <div className="cm-person-text">
        <span className="cm-person-name">
          <Link to={'/u/' + p.username} className="uname">
            {p.username}
          </Link>
          {p.verified && !p.tick_hidden ? <Verified /> : null}
        </span>
        {sub ?? (p.full_name ? <span className="cm-person-sub">{p.full_name}</span> : null)}
      </div>
      {right}
    </div>
  );
}

/** "Owner" with a crown, or "Admin". */
export function RoleTag({ role }: { role: 'owner' | 'admin' }) {
  return (
    <span className="cm-tag">
      {role === 'owner' ? <Icon name="crown" size={13} stroke={2.2} /> : null}
      {role === 'owner' ? 'Owner' : 'Admin'}
    </span>
  );
}
