// Privacy policy, terms, community guidelines, child safety and copyright: the same documents as the
// iPhone app and the website. (Owned by the Settings area.)
import React from 'react';
import { Empty } from '../ui/kit';

export function Legal({ doc }: { doc: string }) {
  return <Empty icon="book" title="Coming soon" body={'The ' + doc + ' page is on its way.'} />;
}
