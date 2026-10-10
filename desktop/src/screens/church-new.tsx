// Add a church, from the iPhone app's church-new.tsx. A member's church waits for an admin before
// it appears for everyone (the database decides; an admin's goes straight in). The iPhone pins the
// church from its address with the phone's geocoder; a computer has none, so the member may pin it
// where they are standing instead, and without a pin it still lists, just without a distance.
import React, { useState } from 'react';
import { addChurch, updateProfile } from 'shared/api';
import { errText } from 'shared/theme';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Icon, ask, toastError } from '../ui/kit';
import { type ChurchForm, ChurchFields, EMPTY_CHURCH, cleanSite, locateMe } from './church-parts';
import '../styles/community.css';

/** Said when a member's church goes in as 'pending'. */
const PENDING_NOTE = 'An admin will check this church before it appears for everyone. You can see it in your list meanwhile.';

export function ChurchNew({ onAdded }: { onAdded: () => void }) {
  const { me, refresh } = useMe();
  const admin = !!me.admin_role;
  const [form, setForm] = useState<ChurchForm>(EMPTY_CHURCH);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; website?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ChurchForm>) => setForm((f) => ({ ...f, ...patch }));

  /** Pin the church where this computer is. Asks for location only now, from the click. */
  async function pinHere() {
    setPinning(true);
    try {
      setPin(await locateMe());
    } catch (e) {
      toastError(new Error((e as GeolocationPositionError)?.code === 1 ? 'Location is off for Community. Allow it for this site in your browser settings.' : "Couldn't find where you are. Try again in a moment."));
    } finally {
      setPinning(false);
    }
  }

  async function save() {
    if (busy) return;
    const name = form.name.trim();
    const site = cleanSite(form.website);
    const errs: typeof errors = {};
    if (!name) errs.name = "Add the church's name.";
    if (site === null) errs.website = 'That website address does not look right.';
    setErrors(errs);
    if (errs.name || errs.website) return;
    setBusy(true);
    try {
      const church = await addChurch(me.id, {
        name,
        address: form.address.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
        website: site ?? '',
        service_times: form.service_times.trim(),
      });
      onAdded();
      // A member's church waits for an admin, so say so before anything else.
      const pending = church.status === 'pending';
      const yes = await ask(
        pending ? 'Thanks!' : 'Make this your church?',
        pending ? `${PENDING_NOTE} Make ${church.name} your church as well? You would appear in its members list.` : `${church.name} would show on your profile, and you would appear in its members list.`,
        'Yes',
        false,
      );
      if (yes) {
        try {
          await updateProfile(me.id, { church_id: church.id });
          await refresh();
        } catch (e) {
          toastError(e);
        }
      }
      // Replace the form in the history, so Back from the church goes to the list, not an empty form.
      nav('/churches/' + church.id, true);
    } catch (e) {
      setErrors({ form: errText(e) });
      setBusy(false);
    }
  }

  return (
    <div className="cm-pane">
      <h1 className="cm-pane-title">Add a church</h1>
      <p className="muted-text cm-pane-intro">
        {admin
          ? 'List a church so the family can find it. As an admin, yours goes straight into the list.'
          : 'List your church so the family can find it. An admin checks each new church before it appears for everyone, and can correct the details later.'}
      </p>
      <form
        className="cm-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <ChurchFields form={form} set={set} errors={errors} autoFocus />
        <div className="cm-pin">
          <Icon name="location" size={22} />
          <div className="cm-pin-text">
            <b>Map pin</b>
            <span>{pin ? 'Pinned where you are now. The list can sort it by distance.' : 'Optional. If you are at the church now, pin it where you are so the list can sort it by distance.'}</span>
          </div>
          {pin ? (
            <button type="button" className="link-btn muted" onClick={() => setPin(null)}>
              Remove pin
            </button>
          ) : (
            <button type="button" className="btn small quiet" onClick={pinHere} disabled={pinning}>
              {pinning ? 'Finding you…' : 'Pin where I am'}
            </button>
          )}
        </div>
        {errors.form ? <p className="form-error">{errors.form}</p> : null}
        <div className="cm-form-foot">
          <button className="btn big" type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add church'}
          </button>
          <button type="button" className="btn big quiet" disabled={busy} onClick={() => nav('/churches')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
