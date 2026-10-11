import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VerifiedTick } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { acceptFollowRequest, fetchFollowRequests, removeFollowRequest } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

/** People waiting to follow my private account. */
export default function FollowRequests() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Once the list has been on screen, a reload that fails leaves it there and says why, rather than replacing it.
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchFollowRequests(me);
      loaded.current = true;
      setError('');
      setList(rows);
    } catch (e) {
      if (loaded.current) {
        toast(errText(e));
      } else {
        setError(errText(e));
        setList([]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [me, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function answer(p: Profile, accept: boolean) {
    // The row goes straight away; it comes back if the database says no.
    setList((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    try {
      if (accept) await acceptFollowRequest(p.id);
      else await removeFollowRequest(p.id, me);
      toast(accept ? `${p.username} now follows you` : 'Request removed');
    } catch (e) {
      toast(errText(e));
      load();
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Follow requests" />
      {list === null ? (
        <RowsSkeleton count={6} avatar={50} trailing="button" />
      ) : error ? (
        <ErrorNote
          message={error}
          onRetry={() => {
            setError('');
            setList(null);
            load();
          }}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          renderItem={({ item: p }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Pressable onPress={() => router.push(`/user/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.full_name || p.username}, ${p.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, opacity: pressed ? 0.7 : 1 })}>
                {/* A story ring is drawn inside the same 50 points, so names line up whether or not someone has one. */}
                <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={p.has_story ? 40 : 50} ring={p.has_story ? 'new' : null} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{p.username}</Text>
                    {p.verified ? <VerifiedTick size={14} /> : null}
                  </View>
                  {p.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text> : null}
                </View>
              </Pressable>
              <Button small label="Confirm" onPress={() => answer(p, true)} />
              <Button small kind="ghost" label="Delete" onPress={() => answer(p, false)} />
            </View>
          )}
          ListHeaderComponent={null}
          ListEmptyComponent={<Empty icon="request" title="No requests" />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.fg2} />}
        />
      )}
    </Screen>
  );
}
