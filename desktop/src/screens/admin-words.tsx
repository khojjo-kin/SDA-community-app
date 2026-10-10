// Offensive words, as on the iPhone console (admin-words): the list the database masks in comments
// and captions. It uses the iPhone app's own functions, so it works on the database as it is (the
// Security page's copy of this list needs the admin database update).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addBlockedWord, fetchBlockedWords, removeBlockedWord } from 'shared/api';
import { errText, fmt } from 'shared/theme';
import { Empty, Failed, Icon, Spinner, toast, useLoad } from '../ui/kit';

const sorted = (list: string[]) => [...new Set(list)].sort((a, b) => a.localeCompare(b));

export function Words() {
  const list = useLoad(() => fetchBlockedWords(), []);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  // The word just removed, offered back for a few seconds in case it was a slip.
  const [removed, setRemoved] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const words = list.data;

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  function offerUndo(word: string | null) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setRemoved(word);
    if (word) undoTimer.current = setTimeout(() => setRemoved(null), 8000);
  }

  async function add(raw: string, fromUndo = false) {
    if (adding) return;
    const w = raw.trim().toLowerCase();
    if (!w) return setDraftError('Type a word first.');
    if (words?.includes(w)) {
      setDraft('');
      setDraftError('');
      return toast(`"${w}" is already on the list`);
    }
    setAdding(true);
    try {
      await addBlockedWord(w);
      list.set(sorted([...(words ?? []), w]));
      if (fromUndo) offerUndo(null);
      else {
        setDraft('');
        setDraftError('');
      }
      toast(fromUndo ? `"${w}" is back on the list` : `Added "${w}"`);
    } catch (e) {
      // addBlockedWord explains what a word may look like when it refuses one.
      if (fromUndo) toast(errText(e));
      else setDraftError(errText(e));
    } finally {
      setAdding(false);
    }
  }

  function remove(word: string) {
    // Off the list at once; put back if the database says no.
    const before = words ?? [];
    list.set(before.filter((x) => x !== word));
    removeBlockedWord(word).then(
      () => offerUndo(word),
      (e) => {
        list.set(sorted([...before]));
        toast(errText(e));
      },
    );
  }

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (words ?? []).filter((w) => !needle || w.includes(needle)), [words, needle]);

  return (
    <div className="admin-wide adm-words-page">
      <div className="dash-head">
        <h1 className="page-title">Offensive words</h1>
      </div>
      <p className="muted-text adm-intro">
        Words on this list are replaced with asterisks in comments and captions as they are posted, including their plural, -ed and -ing forms. Posts already written are not changed. Words the Bible itself uses are deliberately left off, so quoted Scripture is never masked.
      </p>
      <form
        className="adm-word-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <input
          value={draft}
          maxLength={30}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Add a word"
          aria-label="Word to add"
          aria-invalid={!!draftError}
          onChange={(e) => {
            setDraft(e.target.value);
            if (draftError) setDraftError('');
          }}
        />
        <button className="btn" disabled={adding}>
          Add
        </button>
      </form>
      {draftError ? <p className="form-error adm-word-error">{draftError}</p> : null}
      {removed ? (
        <div className="adm-undo" role="status">
          <span>Removed "{removed}"</span>
          <button className="btn quiet small" disabled={adding} onClick={() => add(removed, true)}>
            Undo
          </button>
        </div>
      ) : null}
      {list.loading && !words ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : (
        <>
          <div className="adm-toolbar">
            <b className="adm-words-count">{needle ? `${fmt(shown.length)} of ${fmt(words?.length ?? 0)} words` : `${fmt(words?.length ?? 0)} words`}</b>
            <label className="adm-search">
              <Icon name="search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the list" aria-label="Search the list" />
            </label>
          </div>
          {!shown.length ? (
            needle ? <Empty icon="search" title="No words match" /> : <Empty icon="gavel" title="The list is empty" body="Nothing is masked until you add a word." />
          ) : (
            <ul className="adm-words">
              {shown.map((w) => (
                <li key={w}>
                  <span>{w}</span>
                  <button className="icon-btn" aria-label={'Remove ' + w} onClick={() => remove(w)}>
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
