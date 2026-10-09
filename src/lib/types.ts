export type Media = { url: string; type: 'image' | 'video'; w?: number; h?: number; poster?: string };

/** Text, an emoji or an @mention placed on a story. x and y are the centre, as fractions of the frame. */
export type Overlay = {
  id: string;
  kind: 'text' | 'emoji' | 'mention';
  text: string;
  x: number;
  y: number;
  /** Font size on a frame 390 points wide. It scales with the frame. */
  size: number;
  color: string;
  /** Text only: draw the colour as a filled label behind the words. */
  bg?: boolean;
  /** Mentions only: the account the mention opens. */
  userId?: string;
};

/** One line drawn on a story, as an SVG path in a 1000 x 1778 space. */
export type Stroke = { color: string; width: number; d: string };

/** What a story or a highlight shows. Older stories are plain photos, which is the same shape with nothing extra. */
export type StoryItem = {
  /** The photo or video. Empty for text stories. */
  url: string;
  type: 'image' | 'video' | 'text' | 'collage';
  w?: number;
  h?: number;
  poster?: string;
  /** Videos: length in seconds. */
  duration?: number;
  /** Collages: two to four photos. */
  urls?: string[];
  /** Text stories: which background to use. */
  bg?: number;
  fit?: 'cover' | 'contain';
  caption?: string;
  overlays?: Overlay[];
  strokes?: Stroke[];
};

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
  /** How many other people have seen it. Null when the owner hides view counts. */
  view_count: number | null;
};

export type StoryReplies = 'everyone' | 'following' | 'off';

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
  account_type: 'personal' | 'creator';
  category: string;
  show_view_counts: boolean;
  story_replies: StoryReplies;
  faq_enabled: boolean;
  /** This person is on your close friends list. */
  is_close_friend: boolean;
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

export type Audience = 'everyone' | 'close_friends';

export type Story = {
  id: string;
  user_id: string;
  item: StoryItem;
  created_at: string;
  expires_at: string;
  username: string;
  full_name: string;
  avatar_url: string;
  seen: boolean;
  in_tray: boolean;
  view_count: number;
  audience: Audience;
  story_replies: StoryReplies;
  /** The story's owner follows you. */
  follows_viewer: boolean;
};

export type StoryGroup = { user_id: string; username: string; avatar_url: string; seen: boolean; close: boolean; stories: Story[] };

/** One of your own stories, including ones that have expired. */
export type ArchivedStory = { id: string; user_id: string; item: StoryItem; created_at: string; expires_at: string; audience: Audience };

export type Highlight = { id: string; user_id: string; title: string; cover_url: string; created_at: string };
export type HighlightItem = { id: string; highlight_id: string; user_id: string; item: StoryItem; created_at: string };

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
  muted: boolean;
  /** Messages up to this moment are hidden for you (you deleted the chat). */
  hidden_before: string | null;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  media_url: string;
  audio_url: string;
  audio_seconds: number;
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

export type SavedReply = { id: string; user_id: string; shortcut: string; body: string; created_at: string };
export type Faq = { id: string; user_id: string; question: string; answer: string; position: number; created_at: string };

export type StatsDay = { d: string; views: number; followers: number };
export type StatsTop = { id: string; kind: 'post' | 'reel'; media: Media | null; created_at: string; views: number; likes: number; comments: number };
export type Stats = {
  views: number;
  post_views: number;
  story_views: number;
  /** Different people who saw something of yours. */
  accounts: number;
  new_followers: number;
  followers: number;
  posts: number;
  reels: number;
  stories: number;
  likes: number;
  comments: number;
  reposts: number;
  days: StatsDay[];
  top: StatsTop[];
};
