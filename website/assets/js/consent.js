// Optional, cookieless visit counting with Cloudflare Web Analytics.
//
// This file is only on the page when website/site.json has an analytics_token. Nothing is loaded
// until the visitor taps Allow; the choice is remembered in this browser's localStorage, and the
// "Analytics choice" button in the footer shows the question again.
(() => {
  'use strict';
  const script = document.currentScript;
  const token = script && script.dataset.token;
  const banner = document.getElementById('consent');
  if (!token || !banner) return;

  const KEY = 'community-analytics-consent';
  const read = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  const write = (value) => {
    try { localStorage.setItem(KEY, value); } catch { /* private mode: ask again next time */ }
  };

  const load = () => {
    if (document.getElementById('cf-beacon')) return;
    const beacon = document.createElement('script');
    beacon.id = 'cf-beacon';
    beacon.defer = true;
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.setAttribute('data-cf-beacon', JSON.stringify({ token }));
    document.head.appendChild(beacon);
  };

  let returnFocus = null;
  const show = () => { banner.hidden = false; };
  const hide = () => {
    banner.hidden = true;
    if (returnFocus) { returnFocus.focus(); returnFocus = null; }
  };

  banner.querySelector('[data-consent="accept"]').addEventListener('click', () => {
    write('granted');
    hide();
    load();
  });
  banner.querySelector('[data-consent="decline"]').addEventListener('click', () => {
    write('denied');
    hide();
  });
  banner.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });

  const choice = read();
  if (choice === 'granted') load();
  else if (choice !== 'denied') show();

  const change = document.getElementById('analytics-choice');
  if (change) {
    change.hidden = false;
    change.addEventListener('click', () => {
      returnFocus = change;
      show();
      banner.querySelector('button').focus();
    });
  }
})();
