import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAppFont } from '../../lib/fonts';
import { isStandard, parseDate, Quarterly } from '../../lib/sabbath-school';
import { C } from '../../lib/theme';
import { alpha } from './kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct–Dec 2026", or just the year if the dates cannot be read. */
function span(q: Quarterly): string {
  const a = parseDate(q.start_date);
  const b = parseDate(q.end_date);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return q.id.slice(0, 4);
  return `${MONTHS[a.getMonth()]}–${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/** One quarter in the sideways row: cover, title, when it ran, and a small Start or Continue button. */
function QuarterCard({ q, started, onPress }: { q: Quarterly; started: boolean; onPress: () => void }) {
  const font = useAppFont('bold');
  const group = q.quarterly_group && !isStandard(q) ? q.quarterly_group.name : '';
  const action = started ? 'Continue' : 'Start';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${q.title}, ${span(q)}${group ? `, ${group}` : ''}. ${action}`} style={({ pressed }) => ({ width: 150, opacity: pressed ? 0.75 : 1 })}>
      <Image source={{ uri: q.cover }} contentFit="cover" transition={150} style={{ width: 150, height: 206, borderRadius: 16, backgroundColor: q.color_primary || C.surface2 }} accessibilityIgnoresInvertColors />
      <Text numberOfLines={2} style={{ color: C.fg, fontSize: 14.5, fontWeight: '700', lineHeight: 19, marginTop: 9, fontFamily: font }}>{q.title}</Text>
      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, marginTop: 2 }}>{group ? `${span(q)}, ${group}` : span(q)}</Text>
      <View style={{ alignSelf: 'flex-start', marginTop: 9, height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: alpha(C.accent, 0.16), justifyContent: 'center' }}>
        <Text style={{ color: C.accent2, fontSize: 13, fontWeight: '700' }}>{action}</Text>
      </View>
    </Pressable>
  );
}

/** A sideways row of other quarters to open. */
export function QuarterRow({ quarters, started, onOpen }: { quarters: Quarterly[]; started: (id: string) => boolean; onOpen: (q: Quarterly) => void }) {
  if (!quarters.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
      {quarters.map((q) => (
        <QuarterCard key={q.id} q={q} started={started(q.id)} onPress={() => onOpen(q)} />
      ))}
    </ScrollView>
  );
}
