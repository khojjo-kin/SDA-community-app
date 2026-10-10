// Pod's player: one audio element for the whole app and the bar along the bottom of the window,
// so a song keeps playing while you move around.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { recordPodPlay } from 'shared/api';
import { clock } from 'shared/theme';
import type { PodItem } from 'shared/types';
import { Icon } from './kit';

type PlayerState = {
  item: PodItem | null;
  playing: boolean;
  play: (item: PodItem, queue?: PodItem[]) => void;
  toggle: () => void;
};
const Ctx = createContext<PlayerState>({ item: null, playing: false, play: () => {}, toggle: () => {} });
export const usePlayer = () => useContext(Ctx);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [item, setItem] = useState<PodItem | null>(null);
  const [queue, setQueue] = useState<PodItem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ t: 0, d: 0 });

  useEffect(() => {
    const a = new Audio();
    a.preload = 'auto';
    audio.current = a;
    const update = () => setPos({ t: a.currentTime, d: isFinite(a.duration) ? a.duration : 0 });
    a.addEventListener('timeupdate', update);
    a.addEventListener('loadedmetadata', update);
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    return () => {
      a.pause();
      a.src = '';
    };
  }, []);

  const start = (it: PodItem) => {
    const a = audio.current;
    if (!a) return;
    a.src = it.audio_url;
    a.play().catch(() => setPlaying(false));
    setItem(it);
    recordPodPlay(it.id);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.artist || it.full_name, artwork: it.cover_url ? [{ src: it.cover_url }] : [] });
    }
  };

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const next = () => {
      const i = queue.findIndex((q) => q.id === item?.id);
      if (i >= 0 && i < queue.length - 1) start(queue[i + 1]);
    };
    a.addEventListener('ended', next);
    return () => a.removeEventListener('ended', next);
  }, [queue, item]);

  const value: PlayerState = {
    item,
    playing,
    play(it, q) {
      if (item?.id === it.id) {
        const a = audio.current!;
        a.paused ? a.play() : a.pause();
        return;
      }
      if (q) setQueue(q);
      start(it);
    },
    toggle() {
      const a = audio.current;
      if (!a || !item) return;
      a.paused ? a.play() : a.pause();
    },
  };
  const step = (dir: 1 | -1) => {
    const i = queue.findIndex((q) => q.id === item?.id);
    const n = queue[i + dir];
    if (n) start(n);
    else if (audio.current) audio.current.currentTime = 0;
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {item ? (
        <div className="now-playing" role="region" aria-label="Now playing">
          <span className="np-art">{item.cover_url ? <img src={item.cover_url} alt="" /> : <Icon name="music" size={20} />}</span>
          <span className="row-text">
            <b>{item.title}</b>
            <span>{item.artist || item.full_name}</span>
          </span>
          <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>
            <Icon name="skipback" size={18} />
          </button>
          <button className="np-play" aria-label={playing ? 'Pause' : 'Play'} onClick={value.toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={18} color="#0b1014" />
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => step(1)}>
            <Icon name="skipnext" size={18} />
          </button>
          <span className="np-time">{clock(pos.t)}</span>
          <input
            className="np-seek"
            type="range"
            min={0}
            max={pos.d || 1}
            step={1}
            value={pos.t}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.target.value);
            }}
            aria-label="Position"
          />
          <span className="np-time">{clock(pos.d)}</span>
          <button
            className="icon-btn"
            aria-label="Close player"
            onClick={() => {
              audio.current?.pause();
              setItem(null);
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
