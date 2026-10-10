// Placeholder for the story editor (the Stories area fills this in). Until then a story is made in
// the Create dialog.
import React from 'react';
import type { CreateRequest } from '../lib/create';
import { CreateDialog } from './create';

export function StoryCreate({ request, onClose }: { request: CreateRequest; onClose: () => void }) {
  return <CreateDialog start="story" request={request} onClose={onClose} />;
}
