// Sample data for the demo build. Invented people; abstract pictures generated for this project.
import p01 from './media/01.jpg';
import p02 from './media/02.jpg';
import p03 from './media/03.jpg';
import p04 from './media/04.jpg';
import p05 from './media/05.jpg';
import p06 from './media/06.jpg';
import p07 from './media/07.jpg';
import p08 from './media/08.jpg';
import p09 from './media/09.jpg';
import p10 from './media/10.jpg';
import p11 from './media/11.jpg';
import p12 from './media/12.jpg';
import p13 from './media/13.jpg';
import p14 from './media/14.jpg';
import reel1 from './media/reel1.mp4';
import reel1Poster from './media/reel1.jpg';
import reel2 from './media/reel2.mp4';
import reel2Poster from './media/reel2.jpg';

export const DEMO_ME = 'demo_me';
/** The same id as Erha's real account, so the app treats the chat with her the same way. */
export const ERHA = 'user_3KTkRcnk7CCL3EaTDjWtptR4YMO';

const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString();
const img = (url: string, w = 720, h = 720) => ({ url, type: 'image', w, h });
const tall = (url: string) => img(url, 720, 900);

export function seed(): Record<string, any[]> {
  const people = [
    { id: DEMO_ME, username: 'you', full_name: 'Demo Account', bio: 'This is the sample account the demo signs you in as.', website: '', avatar_url: '', created_at: ago(2000) },
    { id: 'u_grace', username: 'grace_mensah', full_name: 'Grace Mensah', bio: 'Choir · Sabbath School teacher · Psalm 100', website: '', avatar_url: '', verified: true, created_at: ago(1900) },
    { id: 'u_daniel', username: 'daniel_owusu', full_name: 'Daniel Owusu', bio: 'Youth leader. Pathfinders every Sunday.', website: '', avatar_url: '', created_at: ago(1800) },
    { id: 'u_ruth', username: 'ruth_asante', full_name: 'Ruth Asante', bio: 'Health ministries · plant-based recipes', website: '', avatar_url: '', created_at: ago(1700) },
    { id: 'u_samuel', username: 'samuel_boateng', full_name: 'Samuel Boateng', bio: 'Photography for the church media team.', website: '', avatar_url: '', created_at: ago(1600) },
    { id: 'u_esther', username: 'esther_adjei', full_name: 'Esther Adjei', bio: 'Adventurers club · nature walks', website: '', avatar_url: '', created_at: ago(1500) },
    { id: 'u_joseph', username: 'joseph_k', full_name: 'Joseph Kwarteng', bio: 'Elder. Morning devotions at 6.', website: '', avatar_url: '', created_at: ago(1400) },
    { id: ERHA, username: 'erha', full_name: 'Erha', bio: 'Your assistant for Bible, hymnal and church questions.', website: '', avatar_url: '', verified: true, created_at: ago(2100) },
  ];
  const post = (id: string, user_id: string, media: any[], caption: string, hours: number, like_base: number, extra: any = {}) => ({
    id, user_id, media, caption, created_at: ago(hours), kind: 'post', location: '', like_base, view_base: like_base * 4, ...extra,
  });
  const posts = [
    post('p1', 'u_grace', [img(p01)], 'Sabbath sunrise from the hill behind the church. "This is the day the Lord has made."', 2, 128, { location: 'Kumasi Central' }),
    post('p2', 'u_samuel', [tall(p02), tall(p12)], 'Same bay, sunset and moonrise. Swipe for the second one.', 5, 96),
    post('p3', 'u_daniel', [img(p03)], 'Pathfinders camp-out, night one. Every window is somebody\'s evening.', 9, 212),
    post('p4', 'u_ruth', [img(p04)], 'Fog all morning on the prayer walk.', 26, 74),
    post('p5', 'u_esther', [tall(p05), img(p10)], 'The Adventurers learned about the desert today. Wind rewrote the dunes overnight.', 31, 153),
    post('r1', 'u_samuel', [{ url: reel1, type: 'video', w: 720, h: 1280, poster: reel1Poster }], 'Moonrise over the hills, slow pan. #sabbath', 40, 341, { kind: 'reel' }),
    post('p6', 'u_joseph', [tall(p06)], 'Moonrise during evening vespers.', 50, 181),
    post('p7', DEMO_ME, [img(p07)], 'Still water.', 70, 23),
    post('r2', 'u_daniel', [{ url: reel2, type: 'video', w: 720, h: 1280, poster: reel2Poster }], 'Golden hour from the youth hall roof.', 72, 205, { kind: 'reel' }),
    post('p8', 'u_grace', [tall(p08)], 'City lights on the way home from choir practice.', 76, 67),
    post('p9', 'u_ruth', [img(p09)], 'Green after a week of rain. Garden club harvest next week!', 98, 88),
    post('p10', 'u_esther', [tall(p11)], 'Pink haze over the valley.', 150, 59),
    post('p11', DEMO_ME, [tall(p14)], 'Soft morning on the dunes.', 170, 31),
    post('p12', 'u_joseph', [img(p13)], 'Whiteout downtown. Stay warm, church family.', 220, 45),
  ];
  const story = (id: string, user_id: string, item: any, hours: number) => ({ id, user_id, item, created_at: ago(hours), expires_at: new Date(Date.now() + (24 - hours) * 3600e3).toISOString(), audience: 'everyone' });
  const stories = [
    story('s1', 'u_grace', { url: p09, type: 'image', w: 720, h: 720, caption: 'Choir practice tonight at 7' }, 3),
    story('s2', 'u_grace', { url: '', type: 'text', bg: 2, overlays: [{ id: 'o1', kind: 'text', text: 'Happy Sabbath everyone!', x: 0.5, y: 0.45, size: 34, color: '#ffffff' }] }, 2),
    story('s3', 'u_daniel', { url: p03, type: 'image', w: 720, h: 720 }, 6),
    story('s4', 'u_samuel', { url: p12, type: 'image', w: 720, h: 900 }, 8),
    story('s5', 'u_ruth', { url: p04, type: 'image', w: 720, h: 720, caption: 'Prayer walk' }, 11),
    story('s6', 'u_joseph', { url: p13, type: 'image', w: 720, h: 720 }, 14),
  ];
  const follows = [
    ['demo_me', 'u_grace'], ['demo_me', 'u_daniel'], ['demo_me', 'u_samuel'], ['demo_me', 'u_ruth'], ['demo_me', 'u_joseph'], ['demo_me', ERHA],
    ['u_grace', 'demo_me'], ['u_daniel', 'demo_me'], ['u_esther', 'demo_me'], ['u_joseph', 'u_grace'], ['u_samuel', 'u_grace'], ['u_ruth', 'u_grace'], ['u_esther', 'u_grace'],
  ].map(([follower_id, following_id], i) => ({ follower_id, following_id, created_at: ago(500 - i * 20) }));
  const threads = [
    { id: 't1', user_a: DEMO_ME, user_b: 'u_grace', created_at: ago(300) },
    { id: 't2', user_a: 'u_daniel', user_b: DEMO_ME, created_at: ago(200) },
    { id: 't3', user_a: DEMO_ME, user_b: ERHA, created_at: ago(100) },
  ];
  const msg = (id: string, thread_id: string, sender_id: string, text: string, hours: number, extra: any = {}) => ({
    id, thread_id, sender_id, text, created_at: ago(hours), media_url: '', audio_url: '', audio_seconds: 0, post_id: null, call_url: '', call_kind: '', ...extra,
  });
  const messages = [
    msg('m1', 't1', DEMO_ME, 'Your sunrise photo is beautiful.', 1.9),
    msg('m2', 't1', 'u_grace', 'Thank you! I nearly slept through it 😅', 1.7),
    msg('m3', 't1', 'u_grace', 'Are you coming to choir practice tonight?', 1.6),
    msg('m4', 't2', 'u_daniel', 'Pathfinders meet at 9 on Sunday, bring a torch.', 20),
    msg('m5', 't2', DEMO_ME, 'Will do, thanks Daniel.', 19),
    msg('m6', 't3', DEMO_ME, 'What is the memory verse this week?', 48),
    msg('m7', 't3', ERHA, 'This week\'s memory verse is Psalm 46:1: "God is our refuge and strength, a very present help in trouble."', 47.9),
  ];
  const comments = [
    { id: 'c1', post_id: 'p1', user_id: 'u_joseph', text: 'Amen! Beautiful view.', created_at: ago(1.5) },
    { id: 'c2', post_id: 'p1', user_id: 'u_ruth', text: 'Which hill is this?', created_at: ago(1.2) },
    { id: 'c3', post_id: 'p3', user_id: 'u_samuel', text: 'Great night with the youth.', created_at: ago(7) },
    { id: 'c4', post_id: 'p7', user_id: 'u_grace', text: 'So calm. Where was this taken?', created_at: ago(22) },
    { id: 'c5', post_id: 'p5', user_id: 'u_ruth', text: 'The second picture!', created_at: ago(28) },
  ];
  const notifications = [
    { id: 'n1', user_id: DEMO_ME, actor_id: 'u_grace', kind: 'like', post_id: 'p7', body: '', created_at: ago(3), read_at: null },
    { id: 'n2', user_id: DEMO_ME, actor_id: 'u_grace', kind: 'comment', post_id: 'p7', body: 'So calm. Where was this taken?', created_at: ago(22), read_at: null },
    { id: 'n3', user_id: DEMO_ME, actor_id: 'u_esther', kind: 'follow', post_id: null, body: '', created_at: ago(30), read_at: null },
    { id: 'n4', user_id: DEMO_ME, actor_id: 'u_daniel', kind: 'like', post_id: 'p11', body: '', created_at: ago(60), read_at: ago(50) },
  ];
  const hymns = [
    { number: 73, title: 'Holy, Holy, Holy', section: 'Worship', author: 'Reginald Heber', lyrics: '1\nHoly, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! merciful and mighty!\nGod in three persons, blessed Trinity!' },
    { number: 108, title: 'Amazing Grace', section: 'Grace', author: 'John Newton', lyrics: '1\nAmazing grace! how sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.' },
    { number: 462, title: 'Blessed Assurance', section: 'Assurance', author: 'Fanny J. Crosby', lyrics: '1\nBlessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.\n\nRefrain\nThis is my story, this is my song,\nPraising my Saviour all the day long.' },
    { number: 530, title: 'It Is Well With My Soul', section: 'Peace', author: 'Horatio G. Spafford', lyrics: '1\nWhen peace, like a river, attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.' },
  ];
  const churches = [
    { id: 'ch1', name: 'Hillside Seventh-day Adventist Church', address: '12 Hill Road', city: 'Sample Town', country: 'Demo', lat: null, lng: null, website: '', service_times: 'Sabbath School 9:00 · Divine Service 11:00', created_by: null, created_at: ago(900) },
    { id: 'ch2', name: 'Riverside Adventist Fellowship', address: '4 River Lane', city: 'Sample City', country: 'Demo', lat: null, lng: null, website: '', service_times: 'Divine Service 10:30', created_by: null, created_at: ago(800) },
  ];
  const groups = [
    { id: 'g1', kind: 'community', name: 'Youth Ministry', handle: 'youth', description: 'Pathfinders, AY programmes and camps.', cover_url: p03, privacy: 'public', church_id: null, created_by: 'u_daniel', created_at: ago(700) },
    { id: 'g2', kind: 'page', name: 'Hillside Choir', handle: 'hillside_choir', description: 'Rehearsal notes and recordings.', cover_url: p08, privacy: 'public', church_id: null, created_by: 'u_grace', created_at: ago(600) },
  ];
  const group_members = [
    { group_id: 'g1', user_id: 'u_daniel', role: 'owner', status: 'member', created_at: ago(700) },
    { group_id: 'g1', user_id: DEMO_ME, role: 'member', status: 'member', created_at: ago(500) },
    { group_id: 'g2', user_id: 'u_grace', role: 'owner', status: 'member', created_at: ago(600) },
  ];
  return {
    community_profiles: people,
    community_posts: posts,
    community_stories: stories,
    community_story_views: [],
    community_follows: follows,
    community_follow_requests: [],
    community_likes: [{ post_id: 'p1', user_id: DEMO_ME, created_at: ago(1) }, { post_id: 'p3', user_id: DEMO_ME, created_at: ago(8) }],
    community_saves: [{ post_id: 'p6', user_id: DEMO_ME, created_at: ago(30) }],
    community_reposts: [],
    community_comments: comments,
    community_comment_likes: [],
    community_threads: threads,
    community_messages: messages,
    community_thread_reads: [{ thread_id: 't1', user_id: DEMO_ME, last_read_at: ago(1.8) }, { thread_id: 't2', user_id: DEMO_ME, last_read_at: ago(1) }, { thread_id: 't3', user_id: DEMO_ME, last_read_at: ago(1) }],
    community_thread_settings: [],
    community_notifications: notifications,
    community_hymns: hymns,
    community_churches: churches,
    community_groups: groups,
    community_group_members: group_members,
    community_highlights: [{ id: 'h1', user_id: DEMO_ME, title: 'Sabbath', cover_url: p07, created_at: ago(400) }],
    community_highlight_items: [{ id: 'hi1', highlight_id: 'h1', user_id: DEMO_ME, item: { url: p07, type: 'image', w: 720, h: 720 }, created_at: ago(400) }],
    community_close_friends: [],
    community_blocks: [],
    community_post_views: [],
  };
}
