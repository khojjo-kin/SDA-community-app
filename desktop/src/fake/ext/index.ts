// Every area's demo data, installed by src/fake/supabase.ts.
import { ext as admin } from './admin';
import { ext as church } from './church';
import { ext as community } from './community';
import { ext as frame } from './frame';
import { ext as messages } from './messages';
import { ext as posts } from './posts';
import { ext as pro } from './pro';
import { ext as profile } from './profile';
import { ext as settings } from './settings';
import { ext as stories } from './stories';

export const EXTENSIONS = [frame, profile, posts, stories, settings, pro, messages, church, community, admin];
