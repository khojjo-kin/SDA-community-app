// A fundraiser: its story, progress, supporters and the Donate button. (Owned by the money area.)
import React from 'react';
import { Empty } from '../ui/kit';

export function FundraiserPage({ id }: { id: string }) {
  return <Empty icon="heart" title="Fundraiser" body={'Fundraiser ' + id} />;
}
