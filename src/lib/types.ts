export type Media = { url: string; type: 'image' | 'video'; w?: number; h?: number; poster?: string };

export type Post = {
  id: string;
  user_id: string;
  caption: string;
  location: string;
  media: Media[];
  kind: 'post' | 'reel';
  created_at: string;
  username: string;
  full_name: string;
  avatar_url: string;
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked: boolean;
  saved: boolean;
  reposted: boolean;
  following_author: boolean;
};

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  website: string;
  created_at: string;
  posts_count: number;
  followers_count: number;
  following_count: number;
  is_following: boolean;
  follows_me: boolean;
  is_blocked: boolean;
  has_story: boolean;
};

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  text: string;
  created_at: string;
  username: string;
  full_name: string;
  avatar_url: string;
  like_count: number;
  liked: boolean;
};

export type Story = {
  id: string;
  user_id: string;
  item: Media;
  created_at: string;
  expires_at: string;
  username: string;
  full_name: string;
  avatar_url: string;
  seen: boolean;
  in_tray: boolean;
  view_count: number;
};

export type StoryGroup = { user_id: string; username: string; avatar_url: string; seen: boolean; stories: Story[] };

export type Thread = {
  id: string;
  last_message: string;
  last_message_at: string;
  created_at: string;
  other_id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  unread_count: number;
  has_messages: boolean;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  media_url: string;
  audio_url: string;
  post_id: string | null;
  created_at: string;
};

export type Notice = {
  id: string;
  user_id: string;
  actor_id: string;
  kind: 'like' | 'comment' | 'follow' | 'repost';
  post_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  username: string;
  full_name: string;
  avatar_url: string;
  post_media: Media | null;
  is_following: boolean;
};
