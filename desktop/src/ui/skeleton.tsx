// Skeletons: while a page loads, soft shimmering shapes stand where its content will be (a feed post,
// a grid of tiles, rows of people or settings), as on Instagram and the iPhone app (Skeleton.tsx there),
// instead of a spinner. Drawn with the theme's surface colours, so they suit Dark and White. Screen
// readers hear "Loading" once for the whole group; the shapes themselves are hidden from them.
import React from 'react';
import { t } from '../lib/i18n';
import '../styles/skeleton.css';

type Size = number | string;
const px = (v: Size | undefined) => (typeof v === 'number' ? v + 'px' : v);

/** One shimmering shape: a line of text by default; `round` for a picture, `radius` for a card or tile. */
export function Skeleton({ w = '100%', h = 12, radius, round, className, style }: { w?: Size; h?: Size; radius?: number; round?: boolean; className?: string; style?: React.CSSProperties }) {
  return <span className={'sk' + (round ? ' sk-round' : '') + (className ? ' ' + className : '')} style={{ width: px(w), height: px(h), borderRadius: round ? '50%' : radius, ...style }} />;
}

/** Holds a few skeleton shapes and tells screen readers the page is loading. */
export function SkeletonGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={'sk-group' + (className ? ' ' + className : '')} role="status" aria-busy="true" aria-label={t('loading.label')}>
      <div aria-hidden="true" className="sk-shapes">
        {children}
      </div>
    </div>
  );
}

/** Widths for lines of text that differ a little from row to row, so the shapes read as words. */
const LINE = ['62%', '48%', '71%', '55%', '66%', '44%'];

/** Posts in the home feed: who posted, the picture, the action icons and the first lines of the caption. */
export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <SkeletonGroup className="sk-feed">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-post">
          <div className="sk-post-head">
            <Skeleton w={32} h={32} round />
            <Skeleton w={i % 2 ? 110 : 140} h={11} />
          </div>
          <Skeleton className="sk-post-media" w="100%" h="auto" radius={4} />
          <div className="sk-post-actions">
            <Skeleton w={24} h={24} round />
            <Skeleton w={24} h={24} round />
            <Skeleton w={24} h={24} round />
          </div>
          <Skeleton w={90} h={11} />
          <Skeleton w={LINE[i % LINE.length]} h={11} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/**
 * A grid of tiles: a profile's posts (portrait 3:4), its Shorts (tall 9:16, four across), or Explore's
 * mosaic (one tall tile in each block of five).
 */
export function GridSkeleton({ count = 9, kind = 'posts' }: { count?: number; kind?: 'posts' | 'shorts' | 'mosaic' }) {
  return (
    <SkeletonGroup className={'sk-grid sk-grid-' + kind}>
      {Array.from({ length: count }, (_, i) => {
        const block = Math.floor(i / 5);
        const pos = i % 5;
        const tall = kind === 'mosaic' && ((block % 2 === 0 && pos === 2) || (block % 2 === 1 && pos === 0));
        return <Skeleton key={i} className={'sk-tile' + (tall ? ' tall' : '')} w="100%" h="auto" />;
      })}
    </SkeletonGroup>
  );
}

/** Rows of a list: a picture (or an icon), a name and a line under it, and optionally something on the right. */
export function RowsSkeleton({ count = 5, avatar = 44, square, right }: { count?: number; avatar?: number; square?: boolean; right?: boolean }) {
  return (
    <SkeletonGroup className="sk-rows">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-row">
          <Skeleton w={avatar} h={square ? Math.round(avatar * 0.68) : avatar} round={!square} radius={square ? 6 : undefined} />
          <span className="sk-row-text">
            <Skeleton w={LINE[i % LINE.length]} h={12} />
            <Skeleton w={LINE[(i + 3) % LINE.length]} h={10} className="sk-dim" />
          </span>
          {right ? <Skeleton w={64} h={12} /> : null}
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A profile before it arrives: the round picture, the name and counts beside it, then the grid. */
export function ProfileSkeleton() {
  return (
    <SkeletonGroup className="sk-profile">
      <div className="sk-profile-head">
        <Skeleton w={150} h={150} round />
        <div className="sk-profile-info">
          <Skeleton w={180} h={20} />
          <div className="sk-profile-counts">
            <Skeleton w={70} h={14} />
            <Skeleton w={90} h={14} />
            <Skeleton w={90} h={14} />
          </div>
          <Skeleton w={140} h={12} />
          <Skeleton w="70%" h={12} className="sk-dim" />
        </div>
      </div>
      <div className="sk-grid sk-grid-posts">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="sk-tile" w="100%" h="auto" />
        ))}
      </div>
    </SkeletonGroup>
  );
}
