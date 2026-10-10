import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT, type Key } from '../lib/i18n';
import { C, themeName } from '../lib/theme';
import type { BibleMarkColor } from '../lib/types';
import { Icon, IconName } from './Icon';
import { Button, Sheet } from './ui';

/** Highlight colours, in the order offered. The same in both themes; only the tint behind a verse changes. */
export const MARK_COLORS: { id: Exclude<BibleMarkColor, ''>; hex: string; label: Key }[] = [
  { id: 'yellow', hex: '#f2c230', label: 'bibleMarks.yellow' },
  { id: 'green', hex: '#34c271', label: 'bibleMarks.green' },
  { id: 'blue', hex: '#3d8bff', label: 'bibleMarks.blue' },
  { id: 'pink', hex: '#ff5c9a', label: 'bibleMarks.pink' },
  { id: 'purple', hex: '#9b6bff', label: 'bibleMarks.purple' },
];

export function markHex(color: BibleMarkColor): string {
  return MARK_COLORS.find((c) => c.id === color)?.hex ?? 'transparent';
}

/** The soft wash behind a highlighted verse: see-through, so the words read on Dark and on White. */
export function markTint(color: BibleMarkColor): string {
  const hex = MARK_COLORS.find((c) => c.id === color)?.hex;
  if (!hex) return 'transparent';
  const n = parseInt(hex.slice(1), 16);
  const a = themeName() === 'white' ? (color === 'yellow' ? 0.36 : 0.24) : 0.26;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A round colour swatch; `none` draws the "no colour" circle with a line through it. */
export function MarkDot({ color, size = 30, on, none }: { color?: BibleMarkColor; size?: number; on?: boolean; none?: boolean }) {
  return (
    <View style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? C.fg : 'transparent' }}>
      {none ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: C.fg3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <View style={{ width: size * 1.1, height: 1.5, backgroundColor: C.fg3, transform: [{ rotate: '-45deg' }] }} />
        </View>
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: markHex(color ?? '') }} />
      )}
    </View>
  );
}

function BarAction({ icon, label, onPress, dim }: { icon: IconName; label: string; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 12, opacity: dim ? 0.4 : pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={22} color={C.fg} />
      <Text style={{ color: C.fg, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** The bar that rises while verses are chosen: colours, then Note, Copy, Share and Post. */
export function MarkBar({ reference, active, single, onColor, onNote, onCopy, onShare, onPost, onClose }: { reference: string; active: BibleMarkColor | null; single: boolean; onColor: (c: BibleMarkColor) => void; onNote: () => void; onCopy: () => void; onShare: () => void; onPost: () => void; onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityLabel={reference} style={{ position: 'absolute', left: 10, right: 10, bottom: insets.bottom + 10, borderRadius: 22, backgroundColor: C.sheet, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 2 }} style={{ flex: 1 }}>
          {MARK_COLORS.map((c) => (
            <Pressable key={c.id} onPress={() => onColor(c.id)} hitSlop={2} accessibilityRole="button" accessibilityLabel={t(c.label)} accessibilityState={{ selected: active === c.id }}>
              <MarkDot color={c.id} on={active === c.id} />
            </Pressable>
          ))}
          <Pressable onPress={() => onColor('')} hitSlop={2} accessibilityRole="button" accessibilityLabel={t('bibleMarks.none')}>
            <MarkDot none />
          </Pressable>
        </ScrollView>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('bibleMarks.clear')} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, opacity: pressed ? 0.6 : 1 })}>
          <Icon name="close" size={17} color={C.fg2} weight={2.4} />
        </Pressable>
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 6 }} />
      <View style={{ flexDirection: 'row' }}>
        <BarAction icon="compose" label={t('bibleMarks.note')} onPress={onNote} dim={!single} />
        <BarAction icon="copy" label={t('bibleMarks.copy')} onPress={onCopy} />
        <BarAction icon="share" label={t('common.share')} onPress={onShare} />
        <BarAction icon="pluscircle" label={t('bibleMarks.post')} onPress={onPost} />
      </View>
    </View>
  );
}

/** Writing or changing the note on one verse. Saving an empty note, or Delete, takes the note off. */
export function NoteSheet({ visible, reference, verseText, initial, onClose, onSave }: { visible: boolean; reference: string; verseText: string; initial: string; onClose: () => void; onSave: (note: string) => void }) {
  const t = useT();
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);
  const changed = text.trim() !== initial.trim();
  return (
    <Sheet visible={visible} onClose={onClose} title={reference}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 6, gap: 14 }}>
        {verseText ? (
          <Text numberOfLines={6} style={{ color: C.fg2, fontSize: 15.5, lineHeight: 23 }}>
            {verseText}
          </Text>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          autoFocus={!initial}
          placeholder={t('bibleMarks.notePlaceholder')}
          placeholderTextColor={C.fg3}
          selectionColor={C.accent2}
          keyboardAppearance={C.blurTint}
          accessibilityLabel={t('bibleMarks.note')}
          style={{ minHeight: 120, maxHeight: 260, color: C.fg, fontSize: 16, lineHeight: 22, padding: 14, borderRadius: 14, backgroundColor: C.surface, textAlignVertical: 'top' }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {initial ? <Button kind="ghost" label={t('common.delete')} onPress={() => onSave('')} style={{ paddingHorizontal: 22 }} /> : null}
          <Button label={t('bibleMarks.save')} onPress={() => onSave(text)} disabled={!changed || (!initial && !text.trim())} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </Sheet>
  );
}
