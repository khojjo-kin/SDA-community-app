import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Key } from '../lib/i18n';

/*
 * A Bible verse drawn as a picture: the words, a short rule and the reference, on a chosen
 * background. Everything is measured as a share of the card's width, so the small preview on the
 * screen and the 1080-wide picture that is saved come out the same. The words size themselves to
 * fill the card without ever running off it.
 */

export type CardShape = 'square' | 'tall';
export type CardAlign = 'left' | 'center' | 'right';
export type CardDesign = { bg: string; font: string; align: CardAlign; shape: CardShape };

/** A background: a gradient, and the colour the words are written in on it. These are the card's art, the same in both themes. */
export type CardBackground = { id: string; label: Key; colors: readonly [string, string, ...string[]]; ink: string };

export const PHOTO_BG = 'photo';

export const CARD_BACKGROUNDS: CardBackground[] = [
  { id: 'forest', label: 'verseCard.bgForest', colors: ['#0a3d24', '#0c5a45', '#0f766e'], ink: '#ffffff' },
  { id: 'green', label: 'verseCard.bgGreen', colors: ['#22c55e', '#15803d'], ink: '#ffffff' },
  { id: 'night', label: 'verseCard.bgNight', colors: ['#0b1020', '#1b2440', '#2c3866'], ink: '#ffffff' },
  { id: 'dusk', label: 'verseCard.bgDusk', colors: ['#24163f', '#5f2a5c', '#b6534d'], ink: '#ffffff' },
  { id: 'ocean', label: 'verseCard.bgOcean', colors: ['#0f2027', '#203a43', '#2c5364'], ink: '#ffffff' },
  { id: 'dawn', label: 'verseCard.bgDawn', colors: ['#fbe3b4', '#f7b58a', '#ee8e78'], ink: '#3a2016' },
  { id: 'paper', label: 'verseCard.bgPaper', colors: ['#f8f2e4', '#ede3cd'], ink: '#2b2620' },
  { id: 'white', label: 'verseCard.bgWhite', colors: ['#ffffff', '#eef0f2'], ink: '#14181c' },
  { id: 'black', label: 'verseCard.bgBlack', colors: ['#000000', '#17191c'], ink: '#ffffff' },
];

export const backgroundOf = (id: string) => CARD_BACKGROUNDS.find((b) => b.id === id) ?? CARD_BACKGROUNDS[0];

/**
 * The fonts the app bundles. `verse` and `ref` are the cuts for the words and the reference; `lh` is
 * the line height and `cw` roughly how wide a letter is, both as a share of the font size.
 */
export type CardFont = { id: string; name: string; verse: string; ref: string; lh: number; cw: number };

export const CARD_FONTS: CardFont[] = [
  { id: 'lora', name: 'Lora', verse: 'Lora_400Regular', ref: 'Lora_700Bold', lh: 1.42, cw: 0.5 },
  { id: 'lorab', name: 'Lora Bold', verse: 'Lora_700Bold', ref: 'Lora_700Bold', lh: 1.38, cw: 0.53 },
  { id: 'nunito', name: 'Nunito', verse: 'Nunito_700Bold', ref: 'Nunito_700Bold', lh: 1.38, cw: 0.53 },
  { id: 'poppins', name: 'Poppins', verse: 'Poppins_400Regular', ref: 'Poppins_600SemiBold', lh: 1.5, cw: 0.56 },
];

export const fontOf = (id: string) => CARD_FONTS.find((f) => f.id === id) ?? CARD_FONTS[0];

export const DEFAULT_DESIGN: CardDesign = { bg: 'forest', font: 'lora', align: 'center', shape: 'square' };

/** Height over width: 1 for a post, 16:9 for a story. */
export const cardRatio = (shape: CardShape) => (shape === 'tall' ? 16 / 9 : 1);

/** Where things go on a card `w` wide and `h` tall. A tall card keeps clear of a story's top and bottom bars. */
function layoutOf(w: number, h: number, shape: CardShape) {
  const padX = w * 0.1;
  const padY = shape === 'tall' ? h * 0.15 : w * 0.1;
  const refSize = w * 0.034;
  const ruleGap = w * 0.055;
  const rule = Math.max(1, w * 0.004);
  const refGap = w * 0.034;
  const refBlock = ruleGap + rule + refGap + refSize * 1.3;
  return {
    padX,
    padY,
    refSize,
    ruleGap,
    rule,
    refGap,
    boxW: w - padX * 2,
    boxH: h - padY * 2 - refBlock,
    minF: w * 0.03,
    maxF: w * (shape === 'tall' ? 0.095 : 0.085),
  };
}

const quoted = (text: string) => `“${text}”`;

export function VerseCardView({ width, design, text, reference, photo, radius = 0, onReady }: { width: number; design: CardDesign; text: string; reference: string; photo?: string; radius?: number; onReady?: () => void }) {
  const w = Math.max(1, width);
  const h = w * cardRatio(design.shape);
  const g = layoutOf(w, h, design.shape);
  const font = fontOf(design.font);
  const usePhoto = design.bg === PHOTO_BG && !!photo;
  const bg = backgroundOf(design.bg);
  const ink = usePhoto ? '#ffffff' : bg.ink;
  const words = quoted(text);

  /* ----- fitting the words: try a size, measure, shrink until they fit ----- */

  const key = `${words}|${font.id}|${design.shape}|${Math.round(w)}`;
  // A first guess from how many letters there are and how much room: a little large, so fitting only ever shrinks.
  const guess = useMemo(() => {
    const f = Math.sqrt((g.boxW * g.boxH * 0.8) / (Math.max(1, words.length) * font.cw * font.lh));
    return Math.min(g.maxF, Math.max(g.minF, f * 1.06));
  }, [key]);
  const [trial, setTrial] = useState({ key, size: guess });
  // The fitted size as a share of the width, so a change of card width keeps the words steady while they refit.
  const [fit, setFit] = useState<{ key: string; ratio: number } | null>(null);
  const trySize = trial.key === key ? trial.size : guess;
  const fitted = fit?.key === key;
  const size = fit ? fit.ratio * w : trySize;

  const measured = (height: number) => {
    if (height <= g.boxH * 0.97 || trySize <= g.minF + 0.01) {
      setFit({ key, ratio: trySize / w });
      return;
    }
    const step = Math.min(0.97, Math.max(0.72, Math.sqrt((g.boxH * 0.97) / height)));
    setTrial({ key, size: Math.max(g.minF, trySize * step) });
  };

  // A photo must be on the card before it is ready to be saved.
  const [loaded, setLoaded] = useState('');
  const photoReady = !usePhoto || loaded === photo;
  const ready = fitted && photoReady;
  useEffect(() => {
    if (ready) onReady?.();
    // Only when it becomes ready, not when the parent hands over a new callback.
  }, [ready, key]);

  const alignItems = design.align === 'left' ? 'flex-start' : design.align === 'right' ? 'flex-end' : 'center';
  const shadow = usePhoto ? { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: w * 0.012, textShadowOffset: { width: 0, height: w * 0.002 } } : null;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${reference}. ${text}`} style={{ width: w, height: h, borderRadius: radius, overflow: 'hidden', backgroundColor: '#000' }}>
      {usePhoto ? (
        <>
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} onLoad={() => setLoaded(photo ?? '')} onError={() => setLoaded(photo ?? '')} />
          <LinearGradient colors={['rgba(0,0,0,0.34)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <LinearGradient colors={bg.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}

      {/* The measuring copy: unseen, laid out at the size being tried. A new one for each try, so each reports its height. */}
      {fitted ? null : (
        <Text
          key={`${key}|${trySize}`}
          onLayout={(e) => measured(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', top: 0, left: g.padX, width: g.boxW, opacity: 0, fontFamily: font.verse, fontSize: trySize, lineHeight: trySize * font.lh, textAlign: design.align }}>
          {words}
        </Text>
      )}

      <View style={{ ...StyleSheet.absoluteFillObject, paddingHorizontal: g.padX, paddingVertical: g.padY, justifyContent: 'center', alignItems }}>
        <Text style={[{ width: g.boxW, color: ink, fontFamily: font.verse, fontSize: size, lineHeight: size * font.lh, textAlign: design.align, opacity: fit ? 1 : 0 }, shadow]}>{words}</Text>
        <View style={{ width: w * 0.08, height: g.rule, marginTop: g.ruleGap, backgroundColor: ink, opacity: 0.55 }} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[{ maxWidth: g.boxW, marginTop: g.refGap, color: ink, opacity: 0.88, fontFamily: font.ref, fontSize: g.refSize, lineHeight: g.refSize * 1.3, letterSpacing: g.refSize * 0.14, textTransform: 'uppercase', textAlign: design.align }, shadow]}>
          {reference}
        </Text>
      </View>
    </View>
  );
}
