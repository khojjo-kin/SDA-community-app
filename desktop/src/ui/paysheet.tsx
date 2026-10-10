// The payment dialog opened by confirmPay (src/lib/pay.ts): Stripe's card form in the real app, a
// sample form in the demo.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { currentPay, finishPay, money, onPayChange, stripe } from '../lib/pay';
import { useAppearance } from '../lib/appearance';
import { t } from '../lib/i18n';
import { Icon, Modal, Spinner } from './kit';

declare const __DEMO__: boolean;

export function PayLayer() {
  const req = useSyncExternalStore(onPayChange, currentPay);
  if (!req) return null;
  return <PayDialog key={req.clientSecret} />;
}

function PayDialog() {
  const req = currentPay()!;
  const look = useAppearance();
  const box = useRef<HTMLDivElement>(null);
  const handles = useRef<{ s: any; elements: any } | null>(null);
  const [ready, setReady] = useState(__DEMO__);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setup = req.intent === 'setup';

  useEffect(() => {
    if (__DEMO__) return;
    let gone = false;
    stripe()
      .then((s) => {
        if (gone || !box.current) return;
        const elements = s.elements({
          clientSecret: req.clientSecret,
          appearance: {
            theme: look === 'white' ? 'stripe' : 'night',
            variables: { colorPrimary: look === 'white' ? '#16a34a' : '#1fbf5a', borderRadius: '10px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
          },
        });
        const el = elements.create('payment', { layout: 'tabs' });
        el.on('ready', () => !gone && setReady(true));
        el.mount(box.current);
        handles.current = { s, elements };
      })
      .catch((e) => !gone && setError(e?.message ?? t('d.frame.payCouldNotStart')));
    return () => {
      gone = true;
    };
  }, []);

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      if (__DEMO__) {
        await new Promise((r) => setTimeout(r, 700));
        finishPay(true);
        return;
      }
      const { s, elements } = handles.current!;
      const confirmParams = { return_url: location.origin + location.pathname };
      const res = setup
        ? await s.confirmSetup({ elements, redirect: 'if_required', confirmParams })
        : await s.confirmPayment({ elements, redirect: 'if_required', confirmParams });
      if (res.error) {
        setError(res.error.message ?? t('d.frame.payFailed'));
        setBusy(false);
        return;
      }
      finishPay(true);
    } catch (e: any) {
      setError(e?.message ?? t('d.frame.payFailed'));
      setBusy(false);
    }
  };

  return (
    <Modal title={setup ? t('d.frame.addCard') : t('pay.title')} onClose={() => !busy && finishPay(false)} closeOutside={!busy}>
      <div className="pay-sheet">
        <div className="pay-head">
          <span className="pay-icon">
            <Icon name="card" size={22} />
          </span>
          <div className="grow">
            <b>{req.title}</b>
            {req.detail ? <p className="muted-text small">{req.detail}</p> : null}
          </div>
          {!setup ? <b className="pay-amount">{money(req.amountPence, req.currency)}</b> : null}
        </div>
        {__DEMO__ ? (
          <div className="pay-demo">
            <label className="form-row">
              <span>{t('d.frame.cardNumber')}</span>
              <input defaultValue="4242 4242 4242 4242" aria-label={t('d.frame.cardNumber')} />
            </label>
            <div className="form-2">
              <label className="form-row">
                <span>{t('d.frame.expiry')}</span>
                <input defaultValue="12 / 29" aria-label={t('d.frame.expiry')} />
              </label>
              <label className="form-row">
                <span>{t('d.frame.cvc')}</span>
                <input defaultValue="123" aria-label={t('d.frame.cvc')} />
              </label>
            </div>
            <p className="muted-text small">{t('d.frame.demoCard')}</p>
          </div>
        ) : (
          <div className="pay-element" ref={box}>
            {!ready && !error ? <Spinner /> : null}
          </div>
        )}
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn block big" disabled={!ready || busy} onClick={pay}>
          {busy ? t('d.frame.processing') : req.action ?? (setup ? t('checkout.saveCard') : t('checkout.pay', { price: money(req.amountPence, req.currency) }))}
        </button>
        <p className="muted-text small center">
          <Icon name="lock" size={12} /> {t('d.frame.stripeNote')}
        </p>
      </div>
    </Modal>
  );
}
