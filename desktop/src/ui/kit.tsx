// Small shared pieces: icons, avatars, dialogs, menus, toasts, empty states.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ICONS, type IconName } from './icons.gen';
import { nav } from '../lib/router';
import { errText } from 'shared/theme';

export type { IconName };

export function Icon({ name, size = 24, color = 'currentColor', fill, stroke = 1.8, className }: { name: IconName; size?: number; color?: string; fill?: string; stroke?: number; className?: string }) {
  const body = (ICONS[name] as string).replace(/COLOR/g, color);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

export function Verified({ size = 14 }: { size?: number }) {
  return (
    <span className="verified" title="Verified" aria-label="Verified">
      <Icon name="verified" size={size} color="#3d8bff" fill="#3d8bff" stroke={0} />
    </span>
  );
}

const AVATAR_BG = ['#1fbf5a', '#3d8bff', '#a033e8', '#ff8a3d', '#ff3d77', '#0fb58a', '#f5b301'];

/** A round picture. ring: 'new' (unseen story), 'seen', 'close' (close friends), or none. */
export function Avatar({ src, name, size = 32, ring, onClick, label }: { src?: string | null; name: string; size?: number; ring?: 'new' | 'seen' | 'close' | 'live' | null; onClick?: (e: React.MouseEvent) => void; label?: string }) {
  const [broken, setBroken] = useState(false);
  let hash = 0;
  for (const ch of name || '?') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const inner = (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: src && !broken ? '#1b222a' : AVATAR_BG[hash % AVATAR_BG.length] }}>
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} loading="lazy" /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
  const body = ring ? <span className={'ring ring-' + ring} style={{ padding: size > 60 ? 4 : 2 }}>{<span className="ring-gap">{inner}</span>}</span> : inner;
  if (onClick) {
    return (
      <button type="button" className="avatar-btn" onClick={onClick} aria-label={label ?? name}>
        {body}
      </button>
    );
  }
  return body;
}

export function Spinner({ size = 28 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ring">
        <Icon name={icon} size={34} stroke={1.5} />
      </span>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {children}
    </div>
  );
}

export function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="empty">
      <h2>Couldn't load this</h2>
      <p>{errText(error)}</p>
      <button className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

/** A link inside the app. */
export function Link({ to, className, children, onClick, title }: { to: string; className?: string; children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <a
      href={'#' + to}
      className={className}
      title={title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        onClick?.();
        nav(to);
      }}
    >
      {children}
    </a>
  );
}

/* ---------- modal, menu, confirm, toast ---------- */

export function Modal({ onClose, children, className, title, wide, closeOutside = true, bare }: { onClose: () => void; children: React.ReactNode; className?: string; title?: React.ReactNode; wide?: boolean; closeOutside?: boolean; bare?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // The latest onClose, so Escape calls the current one, not the one from when the dialog opened.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Only the dialog on top answers Escape (a confirmation over Create closes alone).
      const scrims = document.querySelectorAll('.scrim');
      if (scrims.length && scrims[scrims.length - 1] !== box.current?.parentElement) return;
      close.current();
    };
    document.addEventListener('keydown', key);
    document.body.classList.add('no-scroll');
    const first = box.current?.querySelector<HTMLElement>('[autofocus], input, textarea');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', key);
      if (!document.querySelector('.scrim')) document.body.classList.remove('no-scroll');
      prev?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => closeOutside && e.target === e.currentTarget && onClose()}>
      {bare ? (
        <button className="scrim-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={26} color="#fff" />
        </button>
      ) : null}
      <div ref={box} role="dialog" aria-modal="true" className={(bare ? '' : 'modal ') + (wide ? 'modal-wide ' : '') + (className ?? '')}>
        {title ? (
          <div className="modal-head">
            <span />
            <h2>{title}</h2>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={22} />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type MenuItem = { label: string; danger?: boolean; bold?: boolean; onClick: () => void };

/** Instagram's list of choices in a centred box, Cancel at the bottom. */
export function ChoiceMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <Modal onClose={onClose} className="choices">
      {items.map((it) => (
        <button
          key={it.label}
          className={(it.danger ? 'danger ' : '') + (it.bold ? 'bold' : '')}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.label}
        </button>
      ))}
      <button onClick={onClose}>Cancel</button>
    </Modal>
  );
}

let confirmHost: ((c: { title: string; body?: string; action: string; danger?: boolean; resolve: (v: boolean) => void }) => void) | null = null;
export function ask(title: string, body: string, action: string, danger = true): Promise<boolean> {
  return new Promise((resolve) => confirmHost?.({ title, body, action, danger, resolve }));
}

let toastHost: ((text: string) => void) | null = null;
export function toast(text: string) {
  toastHost?.(text);
}
export function toastError(e: unknown) {
  toastHost?.(errText(e));
}

export function GlobalLayer() {
  const [confirm, setConfirm] = useState<null | { title: string; body?: string; action: string; danger?: boolean; resolve: (v: boolean) => void }>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    confirmHost = setConfirm;
    let n = 0;
    toastHost = (text) => {
      const id = ++n;
      setToasts((t) => [...t, { id, text }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    };
    return () => {
      confirmHost = null;
      toastHost = null;
    };
  }, []);
  const answer = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };
  return (
    <>
      {confirm ? (
        <Modal onClose={() => answer(false)} className="choices confirm">
          <div className="confirm-text">
            <h3>{confirm.title}</h3>
            {confirm.body ? <p>{confirm.body}</p> : null}
          </div>
          <button className={confirm.danger ? 'danger bold' : 'bold accent'} onClick={() => answer(true)}>
            {confirm.action}
          </button>
          <button onClick={() => answer(false)}>Cancel</button>
        </Modal>
      ) : null}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

/** Calls fn when a click lands outside the element. */
export function useOutside(ref: React.RefObject<HTMLElement | null>, fn: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fn();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', down);
    };
  }, [active, fn]);
}

/** Loads data for a screen: { data, error, loading, reload }. */
export function useLoad<T>(load: () => Promise<T>, deps: any[]): { data: T | undefined; error: unknown; loading: boolean; reload: () => void; set: (v: T) => void } {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({ data: undefined, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: undefined, error, loading: false }),
    );
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), set: (data: T) => setState({ data, error: null, loading: false }) };
}
