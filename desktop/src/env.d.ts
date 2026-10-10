declare module '*.png' { const src: string; export default src; }
declare module '*.jpg' { const src: string; export default src; }
declare module '*.mp4' { const src: string; export default src; }
declare module '*.m4a' { const src: string; export default src; }
declare const __DEMO__: boolean;
declare const __VERSION__: string;
declare module '*.css';
// The shared supabase.ts reads its settings from process.env; the build fills them in.
declare var process: { env: Record<string, string | undefined> };
