import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppFont } from '../../lib/fonts';
import { isStandard, Quarterly } from '../../lib/sabbath-school';
import { C } from '../../lib/theme';
import { Icon, IconName } from '../Icon';
import { ProgressBar } from './kit';

/** The quarter at the head of its lessons: cover, title, how many lessons and how many are finished. */
export function QuarterHero({ quarterly, total, done }: { quarterly: Quarterly; total: number; done: number }) {
  const font = useAppFont('bold');
  const group = quarterly.quarterly_group && !isStandard(quarterly) ? quarterly.quarterly_group.name : '';
  const bg = quarterly.color_primary || '#1f3d35';
  return (
    <View style={{ marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', backgroundColor: bg }}>
      {quarterly.splash ? <Image source={{ uri: quarterly.splash }} contentFit="cover" transition={200} style={[StyleSheet.absoluteFill, { opacity: 0.4 }]} accessibilityIgnoresInvertColors /> : null}
      {/* Darkens whatever the quarter's colour is, so the white text always reads. */}
      <LinearGradient colors={['rgba(0,0,0,0.20)', 'rgba(0,0,0,0.55)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: 'row', padding: 16, gap: 16, alignItems: 'center' }}>
        <Image source={{ uri: quarterly.cover }} contentFit="cover" transition={150} accessibilityLabel={`Cover of ${quarterly.title}`} style={{ width: 88, height: 124, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <View style={{ flex: 1, gap: 4 }}>
          {group ? <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600' }}>{group}</Text> : null}
          <Text accessibilityRole="header" numberOfLines={3} style={{ color: '#ffffff', fontSize: 19, fontWeight: '800', lineHeight: 24, fontFamily: font }}>{quarterly.title}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13.5 }}>{quarterly.human_date}</Text>
          <Text style={{ color: '#ffffff', fontSize: 13.5, fontWeight: '700', marginTop: 8, marginBottom: 6 }}>{`${total} lessons${done ? `, ${done} finished` : ''}`}</Text>
          <ProgressBar value={total ? done / total : 0} />
        </View>
      </View>
    </View>
  );
}

/** One lesson as a coloured square: number, title, dates, and a badge when it is finished. */
export function LessonTile({ n, title, dates, colour, size, done, thisWeek, read, onPress }: { n: number; title: string; dates: string; colour: string; size: number; done: boolean; thisWeek: boolean; read: number; onPress: () => void }) {
  const font = useAppFont('bold');
  const state = done ? ', finished' : thisWeek ? ', this week' : read ? `, ${read} of 7 days read` : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Lesson ${n}, ${title}, ${dates}${state}`}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: 18, overflow: 'hidden', backgroundColor: colour, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {/* A soft light-to-shade wash gives the flat colour a little depth. */}
      <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.22)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, padding: 14, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' }}>{`Lesson ${n}`}</Text>
          {done ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.24)' }}>
              <Icon name="check" size={13} color="#ffffff" weight={3} />
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Done</Text>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 6 }}>
          {thisWeek ? (
            <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: '#ffffff', justifyContent: 'center' }}>
              <Text style={{ color: colour, fontSize: 12, fontWeight: '800' }}>This week</Text>
            </View>
          ) : null}
          <Text numberOfLines={thisWeek ? 3 : 4} style={{ color: '#ffffff', fontSize: 16.5, fontWeight: '800', lineHeight: 21, fontFamily: font }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12.5 }}>{dates}</Text>
        </View>
      </View>
      {/* Started but not finished: a thin line along the bottom shows how far. */}
      {!done && read ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <View style={{ width: `${(read / 7) * 100}%`, height: 4, backgroundColor: '#ffffff' }} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** A row in the Saved and Completed lists: a coloured square, the title, a line under it, and an optional button. */
export function ItemRow({ colour, icon, title, sub, onPress, right, label }: { colour: string; icon: IconName; title: string; sub: string; onPress: () => void; right?: React.ReactNode; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? `${title}, ${sub}`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, paddingRight: 8, paddingVertical: 9, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: colour, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={24} color="#ffffff" weight={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16.5, fontWeight: '600', lineHeight: 21 }}>{title}</Text>
          {sub ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 2 }}>{sub}</Text> : null}
        </View>
      </Pressable>
      {right}
    </View>
  );
}
