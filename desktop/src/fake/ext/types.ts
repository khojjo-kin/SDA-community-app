// What a demo-data extension gets: the in-memory tables and the helpers the views use.
export type Row = Record<string, any>;
export type Ctx = {
  db: Record<string, Row[]>;
  T: (name: string) => Row[];
  me: () => string;
  now: () => string;
  newId: () => string;
  profile: (id: string) => Row;
  profileCard: (p: Row) => Row;
  postCard: (p: Row) => Row;
  follows: (a: string, b: string) => boolean;
  count: (name: string, f: (r: Row) => boolean) => number;
  insertRow: (table: string, row: Row) => Row;
};
/**
 * One area's demo data. seed adds sample rows; views adds read-only views (community_*_cards);
 * rpc adds database functions. Each area keeps its own file so they never clash.
 */
export type Ext = {
  seed?: (ctx: Ctx) => void;
  views?: (ctx: Ctx) => Record<string, () => Row[]>;
  rpc?: (ctx: Ctx) => Record<string, (args: any) => any>;
  /** Edge functions (supabase.functions.invoke): name → handler of the request body. Throw to refuse. */
  functions?: (ctx: Ctx) => Record<string, (body: any) => any>;
};
