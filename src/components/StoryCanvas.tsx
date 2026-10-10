import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { isNormal } from '../lib/filters';
import type { Overlay, StoryItem, Stroke } from '../lib/types';
import { FilteredImage } from './FilterStrip';
import { Icon } from './Icon';

/** Backgrounds for text stories. */
export const STORY_BACKGROUNDS: readonly (readonly [string, string])[] = [
  ['#4a5df6', '#b13df0'],
  ['#ff7a3d', '#ff3d77'],
  ['#0fb58a', '#0a6cf0'],
  ['#15191e', '#3a4350'],
  ['#f5b301', '#f0562e'],
  ['#d6336c', '#7048e8'],
];

/** Colours offered for text and drawing. */
export const STORY_COLORS = ['#ffffff', '#000000', '#ff3040', '#ff8a3d', '#ffd23f', '#3ddc84', '#4a5df6', '#a033e8', '#ff5fa2'];

/** Drawings are stored in this space so they look the same on every screen size. */
export const DRAW_W = 1000;
export const DRAW_H = 1778;

/** The largest 9:16 frame that fits in the space given. */
export function fitFrame(availW: number, availH: number): { w: number; h: number } {
  const w = Math.max(120, Math.min(availW, Math.floor((availH * 9) / 16)));
  return { w, h: Math.round((w * 16) / 9) };
}

/** Black or white, whichever reads better on the colour. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#000000' : '#ffffff';
}

/** How one piece of text, emoji or mention looks. Shared by the editor and the viewer. */
export function OverlayLabel({ o, frameW }: { o: Overlay; frameW: number }) {
  const fontSize = Math.max(10, (o.size * frameW) / 390);
  // Sizes are worked out from the frame, so the phone's text-size setting must not scale them again.
  if (o.kind === 'emoji') return <Text allowFontScaling={false} style={{ fontSize, lineHeight: fontSize * 1.25 }}>{o.text}</Text>;
  if (o.kind === 'mention') {
    return (
      <View style={{ backgroundColor: '#ffffff', borderRadius: fontSize * 0.36, paddingHorizontal: fontSize * 0.46, paddingVertical: fontSize * 0.2 }}>
        <Text allowFontScaling={false} style={{ color: '#c2189a', fontWeight: '800', fontSize }}>@{o.text}</Text>
      </View>
    );
  }
  return (
    <View style={o.bg ? { backgroundColor: o.color, borderRadius: fontSize * 0.3, paddingHorizontal: fontSize * 0.42, paddingVertical: fontSize * 0.16 } : undefined}>
      <Text
        allowFontScaling={false}
        style={{
          color: o.bg ? inkOn(o.color) : o.color,
          fontWeight: '800',
          fontSize,
          lineHeight: fontSize * 1.22,
          textAlign: 'center',
          textShadowColor: o.bg ? 'transparent' : 'rgba(0,0,0,0.35)',
          textShadowRadius: o.bg ? 0 : 4,
          textShadowOffset: { width: 0, height: 1 },
        }}>
        {o.text}
      </Text>
    </View>
  );
}

/** Where an overlay sits: a box centred on its point, big enough to centre any label inside. */
export function overlayBox(o: Overlay, w: number, h: number) {
  const bw = w * 0.92;
  const bh = h * 0.5;
  return { position: 'absolute' as const, left: o.x * w - bw / 2, top: o.y * h - bh / 2, width: bw, height: bh, alignItems: 'center' as const, justifyContent: 'center' as const };
}

export function Strokes({ strokes, width, height }: { strokes: Stroke[]; width: number; height: number }) {
  if (!strokes.length) return null;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${DRAW_W} ${DRAW_H}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {strokes.map((s, i) => (
        <Path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  );
}

function Collage({ urls, w, h }: { urls: string[]; w: number; h: number }) {
  const gap = 3;
  const list = urls.slice(0, 4);
  const half = (h - gap) / 2;
  const cell = (uri: string, cw: number, ch: number, key: number) => <Image key={key} source={{ uri }} style={{ width: cw, height: ch, backgroundColor: '#1b222a' }} contentFit="cover" transition={120} />;
  if (list.length <= 2) {
    return <View style={{ gap }}>{list.map((u, i) => cell(u, w, list.length === 1 ? h : half, i))}</View>;
  }
  const top = list.length === 3 ? list.slice(0, 1) : list.slice(0, 2);
  const bottom = list.length === 3 ? list.slice(1) : list.slice(2);
  return (
    <View style={{ gap }}>
      <View style={{ flexDirection: 'row', gap }}>{top.map((u, i) => cell(u, top.length === 1 ? w : (w - gap) / 2, half, i))}</View>
      <View style={{ flexDirection: 'row', gap }}>{bottom.map((u, i) => cell(u, (w - gap) / 2, half, i))}</View>
    </View>
  );
}

/**
 * Draws a story inside a 9:16 frame: the photo, video, text background or collage,
 * then any drawing, caption, text, emoji and mentions on top.
 */
export function StoryCanvas({
  item,
  width,
  height,
  radius = 0,
  video,
  between,
  onMention,
  hideOverlays,
  hideCaption,
  filter,
}: {
  item: StoryItem;
  width: number;
  height: number;
  radius?: number;
  /** A live video view, shown instead of the still picture for video stories. */
  video?: React.ReactNode;
  /** Drawn above the picture and below text, emoji and mentions. The player puts its tap areas here. */
  between?: React.ReactNode;
  onMention?: (userId: string) => void;
  hideOverlays?: boolean;
  hideCaption?: boolean;
  /**
   * Editor preview only: a preset id from src/lib/filters drawn over the photo. The editor bakes the
   * filter into the uploaded file, so saved stories never carry one and the player leaves this out.
   */
  filter?: string;
}) {
  const bg = STORY_BACKGROUNDS[(item.bg ?? 0) % STORY_BACKGROUNDS.length];
  const full = { position: 'absolute' as const, left: 0, top: 0, width, height };
  const still = item.type === 'video' ? item.poster : item.url;
  const look = filter && !isNormal(filter) ? filter : null;

  let media: React.ReactNode = null;
  if (item.type === 'text') {
    media = <LinearGradient colors={[bg[0], bg[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={full} />;
  } else if (item.type === 'collage') {
    media = (
      <View style={full}>
        <Collage urls={item.urls ?? []} w={width} h={height} />
      </View>
    );
  } else if (item.type === 'video' && video) {
    media = <View style={full}>{video}</View>;
  } else if (still && look) {
    // The filter runs in the native image view, so the photo goes through React Native's own Image here.
    media =
      item.fit === 'contain' ? (
        <>
          <FilteredImage uri={still} filterId={look} style={full} resizeMode="cover" blurRadius={36} />
          <View style={[full, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          <FilteredImage uri={still} filterId={look} style={full} resizeMode="contain" />
        </>
      ) : (
        <FilteredImage uri={still} filterId={look} style={full} resizeMode="cover" />
      );
  } else if (still) {
    media =
      item.fit === 'contain' ? (
        <>
          <Image source={{ uri: still }} style={full} contentFit="cover" blurRadius={36} />
          <View style={[full, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          <Image source={{ uri: still }} style={full} contentFit="contain" transition={120} />
        </>
      ) : (
        <Image source={{ uri: still }} style={full} contentFit="cover" transition={120} />
      );
  } else if (item.type === 'video') {
    media = (
      <View style={[full, { alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="play" size={44} color="#fff" />
      </View>
    );
  }

  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: '#15191e' }}>
      {media}
      <Strokes strokes={item.strokes ?? []} width={width} height={height} />
      {item.caption && !hideCaption ? (
        <>
          <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(height * 0.24) }} />
          <Text numberOfLines={3} allowFontScaling={false} style={{ position: 'absolute', left: 18, right: 18, bottom: 20, color: '#fff', fontSize: Math.max(13, (16 * width) / 390), fontWeight: '600', lineHeight: Math.max(17, (21 * width) / 390) }}>
            {item.caption}
          </Text>
        </>
      ) : null}
      {between}
      {hideOverlays
        ? null
        : (item.overlays ?? []).map((o) => (
            <View key={o.id} pointerEvents="box-none" style={overlayBox(o, width, height)}>
              {o.kind === 'mention' && o.userId && onMention ? (
                <Pressable onPress={() => onMention(o.userId as string)} accessibilityRole="link" accessibilityLabel={`Open ${o.text}'s profile`}>
                  <OverlayLabel o={o} frameW={width} />
                </Pressable>
              ) : (
                <View pointerEvents="none">
                  <OverlayLabel o={o} frameW={width} />
                </View>
              )}
            </View>
          ))}
    </View>
  );
}
