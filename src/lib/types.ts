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
  /** The author has the tick. */
  verified: boolean;
  /** Set when the post was made in a community or page. */
  group_id: string | null;
  group_name: string | null;
  group_kind: 'community' | 'page' | null;
  /** The post is in a group I belong to, so it belongs in my home feed. */
  in_my_group: boolean;
  /** A Plus member has boosted it: it sits at the top of For you and Explore until boosted_until. */
  boosted: boolean;
  boosted_until: string | null;
  /** The author is a Community Plus member. */
  author_plus: boolean;
  /** A song from Pod attached to the post, or null. */
  audio_id: string | null;
  audio_title: string | null;
  audio_artist: string | null;
  audio_url: string | null;
  /** Marked sensitive by its author or an admin: never shown to members under 14. */
  sensitive: boolean;
  /** 'subscribers' posts are only for the author's subscribers. */
  audience: 'everyone' | 'subscribers';
  /** Clips: timed caption lines made from the audio, in captions_lang. */
  captions: CaptionLine[] | null;
  captions_lang: string;
  captions_status: '' | 'pending' | 'ready' | 'none' | 'failed';
};

/** One caption line: start and end in seconds, and the words. */
export type CaptionLine = { s: number; e: number; t: string };

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
  pronouns: string;
  gender: string;
  contact_email: string;
  contact_phone: string;
  church_id: string | null;
  church_name: string | null;
  /** The blue tick. */
  verified: boolean;
  /** Community Plus is active. */
  plus: boolean;
  plus_until: string | null;
  suspended: boolean;
  admin_role: 'owner' | 'admin' | null;
  /** Set when the account was deactivated: hidden now, deleted for good 30 days later unless restored. */
  deleted_at: string | null;
  /** Only followers see this account's posts and stories; following it sends a request. */
  is_private: boolean;
  /** Others see "Seen" under what they send you. Plus members can turn it off. */
  read_receipts: boolean;
  /** I have asked to follow this private account and they have not answered yet. */
  requested: boolean;
  /** This account has asked to follow me. */
  requests_me: boolean;
  /** Broadcasting live right now. */
  is_live: boolean;
  /** How many people looked at this profile in the last 7 days (the list itself is a Plus perk). */
  views_week: number;
  /** Chat streaks are shown (both people must have them on). */
  streaks_enabled: boolean;
  /** Plus: the colour of the ring round this account's highlights and stories. '' is the app's green. See src/lib/styling.ts. */
  ring_color: string;
  /** Plus: the look of this profile page. '' is the plain one. See src/lib/styling.ts. */
  profile_theme: string;
  /** Your own profile only (null on anyone else's): the under-14 rules apply to you. */
  restricted: boolean | null;
  /** Your own profile only (null on anyone else's): the app still needs your birth date. */
  needs_birth_date: boolean | null;
  /** The account's running fundraiser, if it has one. */
  fundraiser_id: string | null;
  /** They let others see when they're online (Settings → Activity status). */
  show_activity: boolean;
  /** When they were last in the app, or null when either of you hides activity status. Online = within 3 minutes. */
  active_at: string | null;
  /** Your own profile only: you're verified but have hidden the tick (Plus). */
  tick_hidden: boolean | null;
  /** How the tick was earned: 'notable' (applied), 'plus' (verified with Plus), 'admin', or ''. */
  verified_via: '' | 'notable' | 'plus' | 'admin';
  /** An admin who hides their follower and following lists: the counts don't open. */
  hide_connections: boolean;
  /** Where the account is based (a country name), for About this account. '' until known. */
  country: string;
  /** A creator's monthly subscription price in pence, or null when they don't offer one. */
  sub_price_pence: number | null;
  /** I subscribe to this creator (active). */
  subscribed: boolean;
  /** Your own profile only: how many people subscribe to you. */
  subscriber_count: number | null;
  /** How many of their posts are for subscribers only. */
  subscriber_posts: number;
  /** Your own profile only: topics you want more or less of in For you and Clips. */
  interests_more: string[] | null;
  interests_less: string[] | null;
  /** 'less' hides posts marked sensitive from For you, Explore and Clips. */
  sensitive_filter: 'less' | 'standard';
  /** I get notifications when they post, share a story, a clip or go live. */
  alerts_on: boolean;
};

export type Church = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  website: string;
  service_times: string;
  created_by: string | null;
  created_at: string;
  /** New churches wait for an admin. Members see their own while pending; everyone sees approved ones. */
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type Hymn = { number: number; title: string; section: string; lyrics: string; author: string };

export type PlusRequest = {
  id: string;
  user_id: string;
  kind: 'verify' | 'plus';
  note: string;
  status: 'pending' | 'approved' | 'declined';
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  /** Identity check for the tick: files in the private community-verification bucket. */
  selfie_path: string;
  document_path: string;
  document_type: '' | DocumentType;
  legal_name: string;
  /** Verification form: 'notable' (free application) or 'plus' (verified with Plus). */
  path: '' | 'notable' | 'plus';
  category: string;
  country: string;
  audience: string;
  known_as: string;
  links: string[];
  /** Only on the admin's list. */
  username?: string;
  full_name?: string;
  avatar_url?: string;
};

export type DocumentType = 'passport' | 'driving_licence' | 'national_id' | 'other';

export type ReportCard = {
  id: string;
  reporter_id: string;
  reason: string;
  created_at: string;
  status: 'open' | 'dismissed' | 'actioned';
  reported_user: string | null;
  reported_post: string | null;
  reported_post_owner: string | null;
  reporter_username: string | null;
  reported_username: string | null;
  reported_full_name: string | null;
  reported_avatar_url: string | null;
  post_caption: string | null;
  post_media: Media | null;
  post_exists: boolean;
};

export type MemberCard = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  created_at: string;
  verified: boolean;
  plus: boolean;
  plus_until: string | null;
  suspended: boolean;
  admin_note: string;
  admin_role: 'owner' | 'admin' | null;
  church_name: string | null;
  posts_count: number;
  reports_count: number;
};

export type AdminStats = {
  lives_now: number;
  pod_items: number;
  support_open: number;
  groups: number;
  income_pence: number;
  income_month_pence: number;
  /** Gifts to members' fundraisers (their money, not the app's). */
  donations_pence?: number;
  deactivated: number;
  members: number;
  members_week: number;
  posts: number;
  posts_week: number;
  stories_live: number;
  messages_week: number;
  reports_open: number;
  requests_open: number;
  verified: number;
  plus: number;
  suspended: number;
  churches: number;
  hymns: number;
};

export type ErhaMessage = { id: string; user_id: string; role: 'user' | 'assistant'; content: string; created_at: string };

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
  verified: boolean;
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
  /** The owner has Plus: their stories come first in the tray. */
  author_plus: boolean;
  verified: boolean;
};

/** Someone who watched one of your stories. Rewatches and times are shown to Plus members. */
export type StoryViewer = { viewer_id: string; viewed_at: string; last_viewed_at: string; view_count: number; profile: Profile | null };

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
  verified: boolean;
  /** Days in a row you have both written. 0 when either of you has streaks off. Shown from 3. */
  streak: number;
  /** When they were last in the app, or null when either of you hides activity status. */
  active_at: string | null;
  /** They have Plus: screenshots of the chat are announced to them. */
  other_plus: boolean;
};

/** A short line above the inbox for 24 hours, seen by mutual followers or close friends. */
export type Note = { user_id: string; text: string; audience: 'mutuals' | 'close_friends'; created_at: string; expires_at: string; username: string; full_name: string; avatar_url: string; verified: boolean; mine: boolean };

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  media_url: string;
  audio_url: string;
  audio_seconds: number;
  post_id: string | null;
  /** A voice or video call: the room both people join. Empty for ordinary messages. */
  call_url: string;
  call_kind: '' | 'voice' | 'video';
  created_at: string;
  /** A photo that can be opened once; after that its file is gone and media_url is ''. */
  view_once: boolean;
  opened_at: string | null;
  /** 'screenshot': a notice that the sender took a screenshot of the chat. */
  system: '' | 'screenshot';
};

export type Notice = {
  id: string;
  user_id: string;
  actor_id: string;
  kind: 'like' | 'comment' | 'follow' | 'repost' | 'request' | 'accept' | 'new_post' | 'new_clip' | 'new_story' | 'live' | 'story_watch' | 'subscriber';
  post_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  username: string;
  full_name: string;
  avatar_url: string;
  post_media: Media | null;
  is_following: boolean;
  /** The person in the notification has the tick. */
  verified: boolean;
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

/** A community (anyone joins and posts) or a page (its owner and admins post, everyone follows). */
export type Group = {
  id: string;
  kind: 'community' | 'page';
  name: string;
  handle: string;
  description: string;
  cover_url: string;
  privacy: 'public' | 'private';
  church_id: string | null;
  created_by: string;
  created_at: string;
  church_name: string | null;
  member_count: number;
  pending_count: number;
  posts_count: number;
  /** Mine: 'owner' | 'admin' | 'member' | 'pending', or null when I am not in it. */
  my_standing: 'owner' | 'admin' | 'member' | 'pending' | null;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'member' | 'pending';
  created_at: string;
  profile: Profile | null;
};

/** Someone who looked at a profile. Plus members see this list for their own profile. */
export type ProfileViewer = { profile_id: string; viewer_id: string; viewed_at: string; username: string; full_name: string; avatar_url: string; verified: boolean };

/** A song or a podcast episode on Pod. */
export type PodItem = {
  id: string;
  user_id: string;
  kind: 'song' | 'podcast';
  title: string;
  artist: string;
  description: string;
  cover_url: string;
  audio_url: string;
  duration_seconds: number;
  plays: number;
  created_at: string;
  username: string;
  full_name: string;
  avatar_url: string;
  /** In my library. */
  saved: boolean;
};

/** Someone broadcasting live right now. */
export type LiveCard = {
  id: string;
  user_id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  viewers: number;
  username: string;
  full_name: string;
  avatar_url: string;
  verified: boolean;
  following: boolean;
};

/** A voice or video call between two people. Signalling goes over Realtime; this row says who is calling whom. */
export type Call = {
  id: string;
  thread_id: string | null;
  caller_id: string;
  callee_id: string;
  kind: 'voice' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended' | 'busy';
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export type Transaction = {
  id: string;
  user_id: string | null;
  kind: 'plus' | 'donation' | 'refund' | 'other' | 'ad' | 'subscription';
  amount_pence: number;
  currency: string;
  note: string;
  created_by: string | null;
  created_at: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_by_username: string | null;
  /** 'stripe' for a card or Apple Pay payment in the app; 'manual' for one an admin logged. */
  provider: 'manual' | 'stripe';
  status: 'succeeded' | 'refunded' | 'failed';
  /** "Apple Pay · Visa •••• 4242" for Stripe payments; empty for manual ones. */
  method: string;
  stripe_invoice_id: string | null;
};

/** A card saved to the member's Stripe customer. */
export type SavedCard = { id: string; brand: string; last4: string; exp_month: number; exp_year: number; wallet: string | null; is_default: boolean };

/** Where the member's Plus subscription stands, from the payments function. */
export type BillingStatus = {
  /** Stripe's subscription status ('active', 'past_due', 'canceled', 'incomplete'…) or 'none'. */
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  /** 'monthly' or 'yearly' once subscribed. */
  plan: 'monthly' | 'yearly' | null;
  /** A new member's first week is free. */
  trial_available: boolean;
  /** In the free week with no card saved for after it: offer to add one, or Plus ends with the week. */
  needs_card?: boolean;
};

export type PaymentsConfig = BillingStatus & {
  /** False until the Stripe keys are added to the payments function. */
  ready: boolean;
  publishable_key: string;
  /** Apple Pay's merchant id, or '' while Apple Pay is not set up. */
  apple_merchant_id: string;
  price_pence: number;
  currency: string;
  /** Test keys: no real money moves; Stripe's test cards work. */
  test_mode: boolean;
  /** What a day of promoting a post costs, in pence. */
  ad_day_pence: number;
  /** The yearly plan, in pence. */
  yearly_pence: number;
  /** Length of the free first week, in days. */
  trial_days: number;
  /** The app's share of a creator subscription, in per cent. */
  creator_fee_percent: number;
};

/** A one-off payment started by the payments function, to confirm with a card or Apple Pay. */
export type OneOffPayment = { payment_intent_id: string; client_secret: string; amount: number; currency: string };

/** Someone you might want to follow. */
export type SuggestedPerson = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  verified: boolean;
  /** People you follow who follow them. */
  mutual_count: number;
  /** Up to two of those people, newest first. */
  mutual_avatars: string[];
  mutual_names: string[];
  /** They already follow you ("Follow back"). */
  follows_me: boolean;
};

/** A paid promotion (an ad) of one of your posts. */
export type Promotion = {
  id: string;
  post_id: string | null;
  user_id: string;
  days: number;
  amount_pence: number;
  currency: string;
  status: 'pending' | 'active' | 'ended' | 'failed' | 'refunded';
  payment_intent_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  /** Joined in the app: the post, when it still exists. */
  post?: Post | null;
};

export type Fundraiser = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  goal_pence: number;
  currency: string;
  cover_url: string;
  ends_at: string | null;
  status: 'active' | 'closed';
  created_at: string;
  username: string;
  full_name: string;
  avatar_url: string;
  verified: boolean;
  raised_pence: number;
  donor_count: number;
  /** The owner's payout account is ready, so donations can be taken. */
  accepting: boolean;
};

/** A recent gift to a fundraiser. Anonymous gifts have no username and say "Anonymous". */
export type Supporter = { id: string; amount_pence: number; currency: string; message: string; created_at: string; username: string | null; full_name: string; avatar_url: string | null };

/** The member's own Stripe account for receiving donations. */
export type PayoutStatus = { has_account: boolean; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean };

/** What is waiting for the admins. */
export type AdminQueue = { churches_pending: number; verifications_pending: number; ads_active: number; fundraisers_active: number };

export type SupportTicket = {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  status: 'open' | 'answered' | 'closed';
  reply: string;
  created_at: string;
  updated_at: string;
  username: string;
  full_name: string;
  avatar_url: string;
};

/** One line of the admin console's activity feed. */
export type ActivityRow = { at: string; kind: 'joined' | 'post' | 'reel' | 'live' | 'report' | 'transaction' | 'support' | 'plus_request' | 'group'; user_id: string | null; username: string | null; detail: string | null };

/** What notifications you get from someone you follow. */
export type FollowAlerts = { posts: boolean; stories: boolean; clips: boolean; live: boolean };

export type SupportChat = { id: string; user_id: string; status: 'open' | 'closed'; agent_id: string | null; agent_name: string; ai_paused_until: string | null; created_at: string; updated_at: string; profile?: Profile | null };
export type SupportMessage = { id: string; chat_id: string; sender_id: string | null; role: 'member' | 'ai' | 'agent'; agent_name: string; text: string; created_at: string };

export type Feedback = { id: string; user_id: string | null; kind: 'review' | 'idea' | 'problem'; rating: number | null; text: string; app_version: string; platform: string; created_at: string; username?: string | null; full_name?: string | null; avatar_url?: string | null };

/** A friend sharing where they are (or you, with mine). */
export type FriendLocation = { user_id: string; lat: number; lng: number; accuracy: number | null; audience: 'mutuals' | 'close_friends'; updated_at: string; username: string; full_name: string; avatar_url: string; verified: boolean; mine: boolean };

/** A subscription between a member and a creator. */
export type CreatorSub = { id: string; creator_id: string; subscriber_id: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean; amount_pence: number; created_at: string; profile?: Profile | null };
