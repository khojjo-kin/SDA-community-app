import React from 'react';
import { ProfileView } from '../../../src/components/ProfileView';
import { useSession } from '../../../src/lib/session';

export default function ProfileTab() {
  const { me } = useSession();
  return <ProfileView userId={me} isTab />;
}
