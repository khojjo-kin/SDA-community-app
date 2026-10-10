import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItemInfo, StyleProp, ViewStyle } from 'react-native';
import { ColorMatrix } from 'react-native-color-matrix-image-filters';
import { captureRef } from 'react-native-view-shot';
import { FILTERS, FilterPreset, filterById, isNormal } from '../lib/filters';
import { DARK } from '../lib/theme';

/* ---------- showing a photo under a filter ---------- */

/**
 * A photo drawn through one of the presets. Normal is the plain image. The filter is applied by the
 * native image view, so this uses React Native's own Image, which the filter library wraps.
 */
export function FilteredImage({ uri, filterId, style, resizeMode = 'cover', blurRadius }: { uri: string; filterId: string; style?: StyleProp<ViewStyle>; resizeMode?: 'cover' | 'contain'; blurRadius?: number }) {
  const preset = filterById(filterId);
  const image = <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={resizeMode} blurRadius={blurRadius} fadeDuration={0} />;
  if (isNormal(preset.id)) return <View style={style}>{image}</View>;
  return (
    <ColorMatrix matrix={preset.matrix} style={style}>
      {image}
    </ColorMatrix>
  );
}

/* ---------- the strip of presets ---------- */

const THUMB = 76;
const GAP = 10;
const SIDE = 16;

function Thumb({ uri, preset, selected, onPress }: { uri: string; preset: FilterPreset; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${preset.name} filter`} accessibilityState={{ selected }} style={({ pressed }) => ({ width: THUMB, alignItems: 'center', gap: 5, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ width: THUMB, height: THUMB, borderRadius: 9, overflow: 'hidden', borderWidth: 2, borderColor: selected ? DARK.accent : 'transparent', backgroundColor: DARK.surface2 }}>
        <FilteredImage uri={uri} filterId={preset.id} style={StyleSheet.absoluteFill} />
      </View>
      <Text numberOfLines={1} style={{ color: selected ? DARK.accent2 : DARK.fg2, fontSize: 11.5, fontWeight: selected ? '700' : '500' }}>
        {preset.name}
      </Text>
    </Pressable>
  );
}

/** A row of the photo under every preset. Each cell is about 76 x 96; the chosen one is outlined in green. */
export function FilterStrip({ uri, value, onChange, disabled, style }: { uri: string; value: string; onChange: (id: string) => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const renderItem = useCallback(({ item }: ListRenderItemInfo<FilterPreset>) => <Thumb uri={uri} preset={item} selected={item.id === value} onPress={() => onChange(item.id)} />, [uri, value, onChange]);
  return (
    <FlatList
      horizontal
      data={FILTERS}
      keyExtractor={(f) => f.id}
      renderItem={renderItem}
      extraData={value}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      getItemLayout={(_data, index) => ({ length: THUMB + GAP, offset: SIDE + (THUMB + GAP) * index, index })}
      contentContainerStyle={{ paddingHorizontal: SIDE, paddingVertical: 10, gap: GAP }}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityLabel="Filters"
      style={[{ flexGrow: 0, opacity: disabled ? 0.6 : 1 }, style]}
    />
  );
}

/* ---------- baking a filter into a file ---------- */

/** Exports never go above this on their longest side, so a 12-megapixel photo does not fill the memory. */
export const MAX_EXPORT_SIDE = 2048;

type Job = { seq: number; uri: string; filterId: string; width: number; height: number; resolve: (uri: string) => void; reject: (e: Error) => void };
type Host = { start: (job: Job) => void };

// Every mounted FilterExporter registers here. Jobs go to the one mounted most recently and run
// one at a time, so two exports never fight over the same offscreen view.
const hosts: Host[] = [];
let queue: Promise<unknown> = Promise.resolve();
let seq = 0;

/**
 * Renders the photo at full size under the preset, offscreen, and returns a temporary JPEG of it.
 * Needs a `FilterExporter` (see `useFilterExport`) mounted on the screen that calls it. For Normal
 * it returns the input uri unchanged. Width and height are the photo's pixel size; the result is
 * that size, shrunk to fit `MAX_EXPORT_SIDE`.
 */
export function renderFiltered(uri: string, filterId: string, width: number, height: number): Promise<string> {
  if (isNormal(filterId)) return Promise.resolve(uri);
  const run = () =>
    new Promise<string>((resolve, reject) => {
      const host = hosts[hosts.length - 1];
      if (!host) {
        reject(new Error('Filters are not ready on this screen. Try again.'));
        return;
      }
      host.start({ seq: ++seq, uri, filterId, width, height, resolve, reject });
    });
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** The pixel size an export comes out at. */
function fitSize(width: number, height: number): { w: number; h: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const k = Math.min(1, MAX_EXPORT_SIDE / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(height * k)) };
}

// On iOS the filter library renders the filtered image on a background queue once the image has
// arrived, then swaps it in. Nothing announces when that is done, so the snapshot waits this long
// after the image loads. The export is a one-off, so the pause is not felt.
const SETTLE_MS = 600;
const GIVE_UP_MS = 30000;

/** One export: a view parked off the left edge of the screen, holding the filtered photo at export size. */
function OffscreenCapture({ job, onDone }: { job: Job; onDone: (out: string | Error) => void }) {
  const ref = useRef<View>(null);
  const [size, setSize] = useState(() => fitSize(job.width, job.height));
  const latest = useRef(onDone);
  latest.current = onDone;
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = useCallback((out: string | Error) => {
    if (finished.current) return;
    finished.current = true;
    latest.current(out);
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  // Nothing fires after the view is gone; the host has already answered the caller by then.
  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((id) => clearTimeout(id));
      t.length = 0;
    };
  }, []);

  // When the caller did not know the photo's size, ask the image itself (it reports the size as displayed, orientation included).
  useEffect(() => {
    if (size) return;
    let live = true;
    Image.getSize(
      job.uri,
      (w, h) => {
        if (!live) return;
        const s = fitSize(w, h);
        if (s) setSize(s);
        else finish(new Error('That photo could not be opened.'));
      },
      () => {
        if (live) finish(new Error('That photo could not be opened.'));
      },
    );
    return () => {
      live = false;
    };
  }, [job.uri, size, finish]);

  // Give up rather than leave the share waiting for ever if the image never loads.
  useEffect(() => {
    later(GIVE_UP_MS, () => finish(new Error('Applying the filter took too long. Try again.')));
  }, [later, finish]);

  function capture() {
    later(SETTLE_MS, () => {
      // iOS: the default snapshot comes from the render server and can be blank for a view parked off
      // the screen; renderInContext draws the layer tree wherever it sits, which is all an image needs.
      captureRef(ref, { format: 'jpg', quality: 0.95, result: 'tmpfile', useRenderInContext: Platform.OS === 'ios' }).then(
        (out) => finish(out),
        (e) => finish(e instanceof Error ? e : new Error('The filtered photo could not be saved.')),
      );
    });
  }

  if (!size) return null;
  // The view is sized in points so that its pixel size on this screen is exactly the export size:
  // view-shot then captures it at that size on both platforms without any resizing.
  const scale = PixelRatio.get();
  const w = size.w / scale;
  const h = size.h / scale;
  const preset = filterById(job.filterId);
  return (
    <View ref={ref} collapsable={false} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10000, top: 0, width: w, height: h, backgroundColor: '#000' }}>
      <ColorMatrix matrix={preset.matrix} style={{ width: w, height: h }}>
        <Image source={{ uri: job.uri }} style={{ width: w, height: h }} resizeMode="cover" fadeDuration={0} onLoad={capture} onError={() => finish(new Error('That photo could not be opened.'))} />
      </ColorMatrix>
    </View>
  );
}

/**
 * The offscreen host that `renderFiltered` draws into. Render it once somewhere on any screen that
 * exports filtered photos; it takes no space and shows nothing until a job arrives.
 */
export function FilterExporter() {
  const [job, setJob] = useState<Job | null>(null);
  const current = useRef<Job | null>(null);

  useEffect(() => {
    const host: Host = {
      start: (j) => {
        current.current = j;
        setJob(j);
      },
    };
    hosts.push(host);
    return () => {
      const i = hosts.indexOf(host);
      if (i >= 0) hosts.splice(i, 1);
      // A job still running when the screen goes away can never finish; say so instead of hanging.
      const j = current.current;
      current.current = null;
      if (j) j.reject(new Error('The screen closed before the filter was applied.'));
    };
  }, []);

  const settle = useCallback((j: Job, out: string | Error) => {
    if (current.current !== j) return;
    current.current = null;
    setJob(null);
    if (out instanceof Error) j.reject(out);
    else j.resolve(out);
  }, []);

  if (!job) return null;
  return <OffscreenCapture key={job.seq} job={job} onDone={(out) => settle(job, out)} />;
}

/**
 * Filter export for a screen: render `exporter` anywhere in the screen's tree, then
 * `exportFiltered(uri, filterId, width, height)` resolves to a temporary JPEG with the filter baked in
 * (or the same uri for Normal).
 */
export function useFilterExport(): { exportFiltered: (uri: string, filterId: string, width: number, height: number) => Promise<string>; exporter: React.ReactNode } {
  const exporter = useMemo(() => <FilterExporter />, []);
  return { exportFiltered: renderFiltered, exporter };
}
