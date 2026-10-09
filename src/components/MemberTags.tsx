import React from 'react';
import { Text, View } from 'react-native';
import { C } from '../lib/theme';
import type { MemberCard } from '../lib/types';

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: bg, justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** The small labels an admin sees on a member: Owner or Admin, Plus, Suspended. */
export function MemberTags({ m }: { m: Pick<MemberCard, 'plus' | 'suspended' | 'admin_role'> }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
      {m.admin_role ? <Tag label={m.admin_role === 'owner' ? 'Owner' : 'Admin'} color={C.accent2} bg="rgba(31,191,90,0.16)" /> : null}
      {m.plus ? <Tag label="Plus" color={C.close} bg="rgba(61,139,255,0.16)" /> : null}
      {m.suspended ? <Tag label="Suspended" color={C.like} bg="rgba(255,48,64,0.16)" /> : null}
    </View>
  );
}
