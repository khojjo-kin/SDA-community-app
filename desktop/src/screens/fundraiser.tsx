// A fundraiser: its story, how far it has got, who has given, and a way to give. Gifts go straight
// to the owner's own Stripe account; Community takes nothing. The owner gets edit, payouts, end and
// delete instead of Donate. Also starting and editing one:
//   /fundraisers/:id        the page          /fundraisers/new        start one
//   /fundraisers/:id/edit   edit it
import React, { useEffect, useRef, useState } from 'react';
import { closeFundraiser, createFundraiser, deleteFundraiser, fetchFundraiser, fetchPayouts, fetchSupporters, refreshFundraiserReady, settlePayment, startDonation, updateFundraiser, uploadImage, type FundraiserInput } from 'shared/api';
import { ago, errText } from 'shared/theme';
import type { Fundraiser, PayoutStatus, Supporter } from 'shared/types';
import { t, tn, tSplit } from '../lib/i18n';
import { useMe } from '../lib/me';
import { money } from '../lib/pay';
import { nav, parts, useRoute } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { copyText, GiftIcon, hasEnded, longDay, Notice, oneOff, pay, penceFrom, ProgressBar, progressOf, shortDay, Toggle } from './pro-kit';
import { PayoutBox } from './pro-money';

/** Quick amounts, in pence. Anything from £1 to £10,000 can be typed instead. */
const PRESETS = [500, 1000, 2000, 5000];
const MIN_GIFT = 100;
const MAX_GIFT = 1_000_000;
/** The key of the words for a fundraiser that can't be deleted because a gift is being paid. */
const GIVING_NOW = 'd.plus.givingNow';

export function FundraiserPage({ id }: { id?: string }) {
  const route = useRoute();
  const editing = parts(route)[2] === 'edit';
  // "/fundraisers" on its own: your fundraisers, on the dashboard.
  useEffect(() => {
    if (!id) nav('/dashboard/fundraisers', true);
  }, [id]);
  if (!id) return <Spinner />;
  if (id === 'new') return <FundraiserForm />;
  if (editing) return <FundraiserForm editId={id} />;
  return <FundraiserView id={id} />;
}

/* ---------- the page ---------- */

function FundraiserView({ id }: { id: string }) {
  const { me } = useMe();
  const data = useLoad(async () => {
    const [f, supporters] = await Promise.all([fetchFundraiser(id), fetchSupporters(id).catch(() => [] as Supporter[])]);
    return { f, supporters };
  }, [id]);
  const [giving, setGiving] = useState(false);
  const [payouts, setPayouts] = useState(false);
  const [working, setWorking] = useState(false);
  // Stripe is asked at most once a visit whether the owner can take gifts yet.
  const asked = useRef(false);
  const f = data.data?.f ?? null;

  useEffect(() => {
    if (!f || f.accepting || f.status !== 'active' || hasEnded(f) || asked.current) return;
    asked.current = true;
    refreshFundraiserReady(f.id)
      .then((ready) => ready && data.reload())
      .catch(() => {});
  }, [f?.id, f?.accepting]);

  if (data.error && !data.data) return <Failed error={data.error} retry={data.reload} />;
  if (!data.data) return <Spinner />;
  if (!f) return <Empty icon="heart" title={t('d.plus.fundUnavailable')} />;

  const mine = f.user_id === me.id;
  const ended = hasEnded(f);
  const open = !ended && f.accepting;
  const pct = Math.round(progressOf(f) * 100);
  const supporters = data.data.supporters;
  const name = f.full_name || f.username;
  // "£195.00 raised of £500.00", with the amount raised in bold wherever it sits in the sentence.
  const [raisedBefore, raisedAfter] = tSplit('d.plus.raisedOf', 'raised', { goal: money(f.goal_pence, f.currency) });

  const share = async () => {
    const link = `${location.origin}${location.pathname}#/fundraisers/${f.id}`;
    toast((await copyText(link)) ? t('d.plus.linkCopied') : link);
  };
  const end = async () => {
    if (working) return;
    const sure = await ask(t('d.plus.endQ'), t('d.plus.endBody'), t('d.plus.endFundraiser'));
    if (!sure) return;
    setWorking(true);
    try {
      await closeFundraiser(f.id);
      toast(t('d.plus.ended'));
      data.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setWorking(false);
    }
  };
  const remove = async () => {
    // Only offered while nobody has given; once someone has, it can be ended instead.
    if (working || f.raised_pence > 0 || f.donor_count > 0) return;
    const sure = await ask(t('d.plus.deleteQ'), t('d.plus.deleteBody'), t('common.delete'));
    if (!sure) return;
    setWorking(true);
    let failure: unknown = null;
    try {
      await deleteFundraiser(f.id);
    } catch (e) {
      failure = e;
    }
    // The database keeps a fundraiser someone is paying a gift to, so look whether it has gone.
    const still = await fetchFundraiser(f.id).catch(() => undefined);
    setWorking(false);
    if (still || (still === undefined && failure)) {
      toast(still ? t(GIVING_NOW) : errText(failure));
      if (still) data.reload();
      return;
    }
    toast(t('d.plus.deleted'));
    nav('/dashboard/fundraisers');
  };

  return (
    <div className="page pro-fund">
      <div className={'pro-fund-cover' + (f.cover_url ? '' : ' blank')}>{f.cover_url ? <img src={f.cover_url} alt="" /> : <GiftIcon size={56} />}</div>
      <div className="pro-fund-grid">
        <div className="pro-fund-main">
          <h1>{f.title}</h1>
          <Link to={'/u/' + f.username} className="pro-organiser">
            <Avatar src={f.avatar_url} name={name} size={44} />
            <span className="row-text">
              <b>
                {name}
                {f.verified ? <Verified /> : null}
              </b>
              <span>{t('d.plus.organiser', { username: f.username })}</span>
            </span>
            <Icon name="right" size={18} />
          </Link>
          {f.description ? <p className="pro-fund-story">{f.description}</p> : null}

          <h2 className="pro-fund-h">{t('d.plus.recentSupporters')}</h2>
          {supporters.length ? (
            <ul className="pro-supporters" aria-label={t('d.plus.recentSupporters')}>
              {supporters.map((s) => (
                <li key={s.id}>
                  {s.username ? (
                    <Avatar src={s.avatar_url} name={s.full_name || s.username} size={40} />
                  ) : (
                    <span className="pro-anon">
                      <Icon name="heart" size={18} />
                    </span>
                  )}
                  <div className="grow">
                    <div className="pro-supporter-top">
                      <b>{s.username ? s.full_name || s.username : t('d.plus.anonymous')}</b>
                      <span className="muted-text small">{ago(s.created_at)}</span>
                    </div>
                    <span className="pro-ok-text pro-gift">{money(s.amount_pence, s.currency)}</span>
                    {s.message ? <p className="muted-text">{s.message}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">{ended ? t('d.plus.nobodyGave') : t('d.plus.noGifts')}</p>
          )}
        </div>

        <aside className="pro-fund-side">
          <div className="pro-fund-card">
            <p className="pro-raised">
              {raisedBefore}
              <strong>{money(f.raised_pence, f.currency)}</strong>
              {raisedAfter}
            </p>
            <ProgressBar value={progressOf(f)} height={10} />
            <div className="pro-fund-meta">
              <span>{tn('d.plus.supporters', f.donor_count)}</span>
              <span>{pct}%</span>
            </div>
            {ended ? (
              <p className="pro-fund-ended">{f.status !== 'closed' && f.ends_at ? t('d.plus.endedOn', { day: shortDay(f.ends_at) }) : t('d.plus.endedDot')}</p>
            ) : f.ends_at ? (
              <p className="muted-text pro-fund-ends">
                <Icon name="clock" size={16} /> {t('creatorSubs.ends', { day: longDay(f.ends_at) })}
              </p>
            ) : null}

            {mine ? (
              <>
                {!ended && !f.accepting ? (
                  <Notice kind="warn">
                    {t('d.plus.notTakingYet')}
                    <button className="btn small pro-notice-btn" onClick={() => setPayouts(true)}>
                      {t('creatorSubs.setUpPayouts')}
                    </button>
                  </Notice>
                ) : null}
                <div className="pro-btns">
                  <button className="btn quiet grow" onClick={() => nav(`/fundraisers/${f.id}/edit`)}>
                    {t('liveSchedule.edit')}
                  </button>
                  <button className="btn quiet grow" onClick={share}>
                    {t('common.share')}
                  </button>
                </div>
                {f.accepting ? (
                  <button className="link-btn" onClick={() => setPayouts(true)}>
                    {t('creatorSubs.payouts')}
                  </button>
                ) : null}
                {!ended ? (
                  <button className="btn danger-outline block" disabled={working} onClick={end}>
                    {t('d.plus.endFundraiser')}
                  </button>
                ) : null}
                {f.raised_pence === 0 && f.donor_count === 0 ? (
                  <button className="link-btn danger pro-center" disabled={working} onClick={remove}>
                    {t('d.plus.deleteFundraiser')}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button className="btn block big" disabled={!open} onClick={() => setGiving(true)}>
                  {ended ? t('d.plus.hasEnded') : open ? t('liveSetup.donate') : t('d.plus.notTaking')}
                </button>
                <button className="btn quiet block" onClick={share}>
                  <Icon name="link" size={16} /> {t('common.share')}
                </button>
              </>
            )}
            <p className="pro-terms">{mine ? t('d.plus.wholeGiftYou') : t('d.plus.wholeGiftName', { name })}</p>
          </div>
        </aside>
      </div>

      {giving ? <DonateDialog f={f} onClose={() => setGiving(false)} onGiven={data.reload} /> : null}
      {payouts ? (
        <Modal title={t('creatorSubs.payouts')} onClose={() => setPayouts(false)} className="pro-modal">
          <div className="pro-modal-body">
            <PayoutBox
              onChange={(s: PayoutStatus) => {
                if (s.charges_enabled && !f.accepting) data.reload();
              }}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------- giving ---------- */

function DonateDialog({ f, onClose, onGiven }: { f: Fundraiser; onClose: () => void; onGiven: () => void }) {
  const [preset, setPreset] = useState<number | null>(1000);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  // The card form is open on top: this dialog steps aside until it closes.
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState<string>('');
  const gift = preset ?? penceFrom(custom);
  const ok = gift !== null && gift >= MIN_GIFT && gift <= MAX_GIFT;
  const amount = ok ? money(gift!, f.currency) : '';

  const give = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await startDonation(f.id, gift!, message.trim(), anonymous);
      const total = money(r.amount, r.currency);
      setPaying(true);
      const paid = await pay({ title: t('d.plus.giftTo', { title: f.title }), detail: `${oneOff(total)} ${t('d.plus.allGoesTo', { name: f.full_name || f.username })}`, amountPence: r.amount, currency: r.currency, clientSecret: r.client_secret, intent: 'payment', action: t('d.plus.giveAmount', { amount: total }) });
      setPaying(false);
      if (!paid) return;
      const settled = await settlePayment(r.payment_intent_id).catch(() => null);
      setThanks(settled?.settled ? total : '');
      if (!settled?.settled) toast(t('d.plus.paymentReceived'));
      onGiven();
      if (!settled?.settled) onClose();
    } catch (e) {
      setPaying(false);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (paying) return null;
  // "To <the fundraiser's title, in bold>, organised by <name>."
  const [toBefore, toAfter] = tSplit('d.plus.toOrganisedBy', 'title', { name: f.full_name || f.username });
  if (thanks) {
    return (
      <Modal onClose={onClose} className="pro-modal pro-thanks">
        <div className="pro-modal-body center">
          <span className="pro-thanks-heart">
            <Icon name="heart" size={40} fill="currentColor" stroke={0} />
          </span>
          <h2>{t('d.plus.thanks')}</h2>
          <p className="muted-text">{t(anonymous ? 'd.plus.thanksLineAnon' : 'd.plus.thanksLine', { amount: thanks, title: f.title })}</p>
          <button className="btn block big" onClick={onClose}>
            {t('checkout.done')}
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={t('d.plus.give')} onClose={() => !busy && onClose()} closeOutside={!busy} className="pro-modal">
      <div className="pro-modal-body">
        <p className="muted-text">
          {toBefore}
          <b className="pro-fg">{f.title}</b>
          {toAfter}
        </p>
        <div className="pro-presets" role="radiogroup" aria-label={t('d.plus.amount')}>
          {PRESETS.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={preset === p}
              className={'pro-preset' + (preset === p ? ' on' : '')}
              onClick={() => {
                setPreset(p);
                setCustom('');
              }}
            >
              {money(p, f.currency).replace(/\.00$/, '')}
            </button>
          ))}
        </div>
        <label className="pro-amount-row">
          <span className="pro-field-label">{t('d.plus.otherAmount')}</span>
          <span className={'pro-money-input' + (preset === null && custom ? ' on' : '')}>
            <span>£</span>
            <input
              value={custom}
              inputMode="decimal"
              placeholder="25"
              maxLength={9}
              aria-label={t('d.plus.otherAmountLabel')}
              onChange={(e) => {
                setCustom(e.target.value.replace(/[^0-9.,]/g, ''));
                setPreset(null);
              }}
            />
          </span>
          {preset === null && custom && !ok ? <span className="form-error">{gift === null ? t('d.plus.amountFormat') : t('d.plus.amountRange')}</span> : null}
        </label>
        <label className="form-row">
          <span>{t('d.plus.messageOptional')}</span>
          <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('d.plus.messageHint')} maxLength={300} />
        </label>
        <div className="pro-toggle-row">
          <span className="grow">
            <b>{t('d.plus.giveAnon')}</b>
          </span>
          <Toggle on={anonymous} onChange={setAnonymous} label={t('d.plus.giveAnon')} />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn block big" disabled={!ok || busy} onClick={give}>
          {busy ? t('d.plus.startingPayment') : ok ? t('d.plus.continueAmount', { amount }) : t('age.continue')}
        </button>
        <p className="pro-terms center">
          {ok ? oneOff(amount) : t('d.plus.oneOffGift')} {t('d.plus.stripeHandles')}
        </p>
      </div>
    </Modal>
  );
}

/* ---------- starting or editing one ---------- */

/** The same limits as the database: a goal of £1 to £1,000,000, a title of 3 to 80 characters. */
const MIN_GOAL = 100;
const MAX_GOAL = 100_000_000;
type Ends = 'keep' | 'none' | 7 | 30 | 90;
/** How long a new fundraiser runs; each label is the key of its words. */
const END_CHOICES: { value: Ends; label: string }[] = [
  { value: 'none', label: 'd.plus.noEndDate' },
  { value: 7, label: 'd.plus.days7' },
  { value: 30, label: 'd.plus.days30' },
  { value: 90, label: 'd.plus.days90' },
];
const poundsText = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));

function FundraiserForm({ editId }: { editId?: string }) {
  const { me } = useMe();
  const existing = useLoad<Fundraiser | null>(() => (editId ? fetchFundraiser(editId) : Promise.resolve(null)), [editId]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [cover, setCover] = useState<{ uri: string; width: number } | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [ends, setEnds] = useState<Ends>('none');
  const [errors, setErrors] = useState<{ title?: string; goal?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  // Started without payouts: the page turns into a nudge to set them up.
  const [started, setStarted] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const f = existing.data;
    if (!f) return;
    setTitle(f.title);
    setDescription(f.description);
    setGoal(poundsText(f.goal_pence));
    setCoverUrl(f.cover_url);
    setEnds(f.ends_at ? 'keep' : 'none');
  }, [existing.data]);

  const chooseCover = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast(t('d.plus.choosePhoto'));
    const uri = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setCover({ uri, width: img.naturalWidth });
    img.onerror = () => toast(t('d.plus.photoUnreadable'));
    img.src = uri;
  };

  async function save() {
    if (busy) return;
    const trimmed = title.trim();
    const pence = penceFrom(goal);
    const errs: typeof errors = {};
    if (trimmed.length < 3 || trimmed.length > 80) errs.title = t('d.plus.titleLength');
    if (pence === null) errs.goal = t('d.plus.goalFormat');
    else if (pence < MIN_GOAL || pence > MAX_GOAL) errs.goal = t('d.plus.goalRange');
    setErrors(errs);
    if (errs.title || errs.goal || pence === null) return;
    setBusy(true);
    try {
      // The photo is uploaded only now, so backing out of the form leaves nothing behind in storage.
      const cover_url = cover ? (await uploadImage(me.id, cover.uri, cover.width, 1200)).url : coverUrl;
      const ends_at = ends === 'keep' ? undefined : ends === 'none' ? null : new Date(Date.now() + ends * 86400e3).toISOString();
      const fields: FundraiserInput = { title: trimmed, description: description.trim(), goal_pence: pence, cover_url };
      if (ends_at !== undefined) fields.ends_at = ends_at;
      if (existing.data) {
        await updateFundraiser(existing.data.id, fields);
        toast(t('d.plus.fundSaved'));
        nav('/fundraisers/' + existing.data.id);
        return;
      }
      const id = await createFundraiser(me.id, fields);
      // Donations need a payout account. If it cannot be checked, say so anyway.
      const payouts = await fetchPayouts().catch(() => null);
      if (payouts?.charges_enabled) {
        toast(t('d.plus.fundLive'));
        nav('/fundraisers/' + id, true);
      } else {
        setStarted(id);
      }
    } catch (e) {
      setErrors({ form: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  const heading = editId ? t('d.plus.editFundraiser') : t('d.plus.newFundraiser');
  if (started) {
    return (
      <div className="page pro-fund-form">
        <div className="pro-verify-done">
          <span className="pro-verify-tick ok">
            <GiftIcon size={44} />
          </span>
          <h2>{t('d.plus.fundLive')}</h2>
          <p>
            <b>{t('d.plus.setUpToReceive')}</b>
          </p>
          <div className="pro-btns">
            <button className="btn big" onClick={() => nav('/dashboard/fundraisers')}>
              {t('creatorSubs.setUpPayouts')}
            </button>
            <button className="btn quiet big" onClick={() => nav('/fundraisers/' + started, true)}>
              {t('d.plus.viewFundraiser')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  let body: React.ReactNode;
  if (me.restricted === true) body = <Empty icon="heart" title={t('d.plus.fundAge')} />;
  else if (existing.error && !existing.data) body = <Failed error={existing.error} retry={existing.reload} />;
  else if (editId && existing.data === undefined) body = <Spinner />;
  else if (editId && !existing.data) body = <Empty icon="heart" title={t('d.plus.fundNotFound')} />;
  else if (existing.data && existing.data.user_id !== me.id) body = <Empty icon="heart" title={t('d.plus.onlyOwn')} />;
  else {
    const shown = cover?.uri || coverUrl;
    const offered = END_CHOICES.map((c) => ({ value: c.value, label: t(c.label) }));
    const choices: { value: Ends; label: string }[] = existing.data?.ends_at ? [{ value: 'keep', label: t('creatorSubs.ends', { day: shortDay(existing.data.ends_at) }) }, ...offered] : offered;
    body = (
      <div className="pro-form">
        <button type="button" className={'pro-cover-pick' + (shown ? ' has' : '')} onClick={() => input.current?.click()} disabled={busy} aria-label={shown ? t('d.plus.changeCoverPhoto') : t('d.plus.addCoverPhoto')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseCover(e.dataTransfer.files?.[0]); }}>
          {shown ? <img src={shown} alt="" /> : null}
          <span className="pro-cover-label">
            <Icon name="image" size={20} /> {shown ? t('d.plus.changeCover') : t('d.plus.addCoverPhoto')}
          </span>
          {shown ? null : <span className="muted-text small">{t('d.plus.coverHint')}</span>}
        </button>
        {shown ? (
          <button className="link-btn muted" disabled={busy} onClick={() => { setCover(null); setCoverUrl(''); }}>
            {t('ssPub.removePhoto')}
          </button>
        ) : null}
        <input ref={input} type="file" accept="image/*" hidden aria-label={t('d.plus.coverPhoto')} onChange={(e) => { chooseCover(e.target.files?.[0]); e.target.value = ''; }} />

        <label className="form-row">
          <span>{t('ssPub.title')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('d.plus.titleHint')} maxLength={80} autoFocus={!editId} />
          {errors.title ? <span className="form-error">{errors.title}</span> : null}
        </label>
        <label className="form-row">
          <span>{t('d.plus.goal')}</span>
          <span className="pro-money-input">
            <span>£</span>
            <input value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="1,000" inputMode="decimal" maxLength={12} aria-label={t('d.plus.goalLabel')} />
          </span>
          {errors.goal ? <span className="form-error">{errors.goal}</span> : null}
        </label>
        <label className="form-row">
          <span>{t('d.plus.story')}</span>
          <textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('d.plus.storyHint')} maxLength={2000} />
          <em className="pro-count">{description.length}/2000</em>
        </label>
        <div className="form-row">
          <span>{t('d.plus.endDate')}</span>
          <div className="pro-chips" role="radiogroup" aria-label={t('d.plus.endDate')}>
            {choices.map((c) => (
              <button key={String(c.value)} type="button" role="radio" aria-checked={ends === c.value} className={'pro-chip' + (ends === c.value ? ' on' : '')} onClick={() => setEnds(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
          {typeof ends === 'number' ? <span className="pro-hint">{t('d.plus.endsOnHint', { day: longDay(new Date(Date.now() + ends * 86400e3)) })}</span> : null}
        </div>
        {errors.form ? <p className="form-error">{errors.form}</p> : null}
        <button className="btn big block" disabled={busy} onClick={save}>
          {busy ? t('d.plus.saving') : existing.data ? t('liveSchedule.saveChanges') : t('d.plus.startFundraiser')}
        </button>
        <p className="pro-terms center">{t('d.plus.formTerms')}</p>
      </div>
    );
  }
  return (
    <div className="page pro-fund-form">
      <Link to={editId ? '/fundraisers/' + editId : '/dashboard/fundraisers'} className="pro-back">
        <Icon name="back" size={18} /> {editId ? t('liveSetup.fundraiser') : t('d.plus.yourFundraisers')}
      </Link>
      <h1 className="pro-title">{heading}</h1>
      {body}
    </div>
  );
}
