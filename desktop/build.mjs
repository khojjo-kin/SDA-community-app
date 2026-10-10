// Builds the desktop app into dist/ with esbuild.
//   node build.mjs          the real app: Clerk sign-in, the live Supabase project
//   node build.mjs --demo   sample data in memory, no sign-in (previews and tests)
//   node build.mjs --watch  rebuild on change
//
// The desktop app shares its data code with the iPhone app: src/lib/api.ts, store.ts, types.ts,
// theme.ts and supabase.ts in the repository root are used as they are. The few iPhone-only modules
// they import (file reading, image resizing, video thumbnails) are swapped for browser versions in
// src/shims.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const demo = process.argv.includes('--demo');
// --wire: the real app (Clerk sign-in) with the stand-in database, for tests/wiring.test.cjs.
const wire = process.argv.includes('--wire');
// --single: one self-contained HTML page (pictures inlined), for previews.
const single = process.argv.includes('--single');
const watch = process.argv.includes('--watch');
const outdir = path.join(here, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : demo ? 'dist-demo' : wire ? 'dist-wire' : 'dist');

// Use the project's esbuild when installed, otherwise one found on this machine.
const require = createRequire(import.meta.url);
let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  esbuild = require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild');
}
const globalModules = (() => {
  try { return execSync('npm root -g').toString().trim(); } catch { return ''; }
})();

// Public settings from the repository's .env (the same three values the iPhone app ships with).
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
  const m = /^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
const define = {
  'process.env.EXPO_PUBLIC_SUPABASE_URL': JSON.stringify(env.EXPO_PUBLIC_SUPABASE_URL || ''),
  'process.env.EXPO_PUBLIC_SUPABASE_KEY': JSON.stringify(env.EXPO_PUBLIC_SUPABASE_KEY || ''),
  'process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY': JSON.stringify(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || ''),
  'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
  __DEMO__: JSON.stringify(demo),
  // The shared iPhone code reads React Native's __DEV__ (for example in errText).
  __DEV__: 'false',
  __VERSION__: JSON.stringify(pkg.version),
};

const shim = (name) => path.join(here, 'src/shims', name);
const alias = {
  shared: path.join(root, 'src/lib'),
  'expo-crypto': shim('expo-crypto.ts'),
  'expo-file-system': shim('expo-file-system.ts'),
  'expo-image-manipulator': shim('expo-image-manipulator.ts'),
  'expo-video-thumbnails': shim('expo-video-thumbnails.ts'),
  'react-native-url-polyfill/auto': shim('empty.ts'),
  '@react-native-async-storage/async-storage': shim('async-storage.ts'),
  'expo-secure-store': shim('secure-store.ts'),
  'react-native': shim('react-native.tsx'),
  'react-native-webrtc': shim('webrtc.ts'),
  'react-native-color-matrix-image-filters': shim('color-matrix.ts'),
};

// The shared call code (src/lib/calls.tsx) imports the iPhone app's call screen, toast and session
// by relative path; the desktop provides its own versions of those three.
const sharedShims = {
  name: 'shared-shims',
  setup(b) {
    const lib = path.join(root, 'src/lib');
    const map = {
      '../components/CallScreen': path.join(here, 'src/ui/callscreen.tsx'),
      '../components/ui': path.join(here, 'src/shared-shims/ui.tsx'),
      './session': path.join(here, 'src/shared-shims/session.tsx'),
    };
    b.onResolve({ filter: /^(\.\.\/components\/(CallScreen|ui)|\.\/session)$/ }, (args) => (path.dirname(args.importer) === lib ? { path: map[args.path] } : undefined));
  },
};
if (demo || wire) {
  alias['@supabase/supabase-js'] = path.join(here, 'src/fake/supabase.ts');
}

const options = {
  entryPoints: [path.join(here, 'src/main.tsx')],
  bundle: true,
  format: 'esm',
  splitting: false,
  outdir,
  entryNames: 'app',
  assetNames: 'assets/[name]-[hash]',
  loader: single ? { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.mp4': 'dataurl', '.m4a': 'dataurl' } : { '.png': 'file', '.jpg': 'file', '.svg': 'file', '.mp4': 'file', '.m4a': 'file' },
  jsx: 'automatic',
  target: ['chrome120', 'safari16'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define,
  alias,
  plugins: [sharedShims],
  nodePaths: [path.join(here, 'node_modules'), globalModules].filter(Boolean),
  logLevel: 'info',
  legalComments: 'none',
};

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8').replace('%MODE%', demo ? 'demo' : 'live');
fs.writeFileSync(path.join(outdir, 'index.html'), html);
fs.copyFileSync(path.join(here, 'build/icon.png'), path.join(outdir, 'icon.png'));

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
  if (single) {
    // The page skeleton is added by the preview host, so this is the body only: title, style, app.
    const js = fs.readFileSync(path.join(outdir, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
    const css = fs.readFileSync(path.join(outdir, 'app.css'), 'utf8');
    const page = [
      '<title>Community for Mac</title>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,600;1,700&display=swap">',
      '<style>' + css + '</style>',
      '<div id="root"></div>',
      '<script type="module">' + js + '</script>',
    ].join('\n');
    fs.writeFileSync(path.join(outdir, 'preview.html'), page);
    console.log('preview.html', Math.round(page.length / 1024) + ' KB');
  }
}
