// Small pieces the church screens share: how a church's place, website and map link are written,
// the "Pending review" pill, and the form fields for adding or correcting a church.
import React from 'react';
import type { Church } from 'shared/types';
import { t } from '../lib/i18n';
import '../styles/community.css';

/** "12 Hill Road, Sample Town, Demo": the parts that are filled in. */
export const placeOf = (c: Pick<Church, 'address' | 'city' | 'country'>) => [c.address, c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');

/** "Sample Town, Demo": for the list, where the street would be too long. */
export const townOf = (c: Pick<Church, 'city' | 'country'>) => [c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');

/** "example.org" was allowed when the church was added, so give it a scheme before opening. */
export const siteOf = (c: Pick<Church, 'website'>) => {
  const s = (c.website ?? '').trim();
  return s ? (/^https?:\/\//i.test(s) ? s : `https://${s}`) : '';
};

/**
 * Checks a typed website as the iPhone app does: "example.org" or "https://example.org". Empty stays
 * empty; anything that does not look like a site is null.
 */
export function cleanSite(raw: string): string | null {
  const s = raw.trim();
  if (!s) return '';
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(url) ? url : null;
}

/** Apple Maps on the web and the Mac: a pin wins over the typed address. */
export function mapsUrl(c: Church) {
  if (c.lat !== null && c.lng !== null) return `https://maps.apple.com/?ll=${c.lat},${c.lng}&q=${encodeURIComponent(c.name)}`;
  return `https://maps.apple.com/?q=${encodeURIComponent(placeOf(c) || c.name)}`;
}

/** Churches not yet approved carry a pill. Members only see their own; admins see every pending one. Keys: say them with t(). */
export const STATUS_LABEL: Partial<Record<Church['status'], string>> = { pending: 'd.community.pendingReview', rejected: 'ssPub.rejected' };

export function StatusPill({ status }: { status: Church['status'] }) {
  const label = STATUS_LABEL[status];
  if (!label) return null;
  return <span className={'cm-status ' + status}>{t(label)}</span>;
}

/** The fields a church has, as the add and edit forms show them. */
export type ChurchForm = { name: string; address: string; city: string; country: string; service_times: string; website: string };
export const EMPTY_CHURCH: ChurchForm = { name: '', address: '', city: '', country: '', service_times: '', website: '' };

export function ChurchFields({ form, set, errors, autoFocus }: { form: ChurchForm; set: (patch: Partial<ChurchForm>) => void; errors: { name?: string; website?: string }; autoFocus?: boolean }) {
  return (
    <>
      <label className="form-row">
        <span>{t('d.community.churchName')}</span>
        <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('d.community.churchNamePlaceholder')} maxLength={120} autoFocus={autoFocus} />
        {errors.name ? <span className="form-error">{errors.name}</span> : null}
      </label>
      <label className="form-row">
        <span>{t('d.community.address')}</span>
        <input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder={t('d.community.addressPlaceholder')} maxLength={200} />
      </label>
      <div className="form-2 cm-form-2">
        <label className="form-row">
          <span>{t('d.community.city')}</span>
          <input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder={t('d.community.city')} maxLength={80} />
        </label>
        <label className="form-row">
          <span>{t('d.community.country')}</span>
          <input value={form.country} onChange={(e) => set({ country: e.target.value })} placeholder={t('d.community.country')} maxLength={80} />
        </label>
      </div>
      <label className="form-row">
        <span>{t('d.community.serviceTimes')}</span>
        <input value={form.service_times} onChange={(e) => set({ service_times: e.target.value })} placeholder={t('d.community.serviceTimesPlaceholder')} maxLength={200} />
      </label>
      <label className="form-row">
        <span>{t('d.community.website')}</span>
        <input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" maxLength={500} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" />
        {errors.website ? <span className="form-error">{errors.website}</span> : null}
      </label>
    </>
  );
}

/** Where the computer is, once. The browser asks the member first; this is only called from a click. */
export function locateMe(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Object.assign(new Error('nofix'), { code: 2 }));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60e3 },
    );
  });
}
