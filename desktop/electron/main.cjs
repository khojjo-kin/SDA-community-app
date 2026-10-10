// Community for Mac: a native window around the desktop app in ../dist.
//
// The app is served from a small web server inside the app on http://localhost:47821, because
// Clerk's sign-in needs a real web address (it does not work from file://). The port stays the
// same between launches, so you stay logged in.
const { app, BrowserWindow, Menu, shell, session, nativeTheme } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 47821;
const ROOT = path.join(__dirname, '..', 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

let origin = '';
let win = null;

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end();
        return;
      }
      if (url.pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    });
    const listen = (port) => {
      server.once('error', (e) => (port === PORT ? listen(0) : reject(e)));
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    };
    listen(PORT);
  });
}

function isOurs(url) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Sign-in pages (Clerk and the Google/Apple screens it can send you to) stay in the window. */
function isSignIn(url) {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)clerk\.(accounts\.dev|com)$/.test(host) || /(^|\.)accounts\.google\.com$/.test(host) || /(^|\.)appleid\.apple\.com$/.test(host) || host.endsWith('.clerk.accounts.dev');
  } catch {
    return false;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    // A desktop layout only: the window can't be made phone-sized.
    minWidth: 1000,
    minHeight: 640,
    title: 'Community',
    backgroundColor: '#0b1014',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(origin + '/');

  // Links that open a new window (other websites, call links) go to your browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOurs(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // Leaving the app for anything except signing in opens your browser instead.
  win.webContents.on('will-navigate', (e, url) => {
    if (isOurs(url) || isSignIn(url)) return;
    e.preventDefault();
    shell.openExternal(url);
  });
  win.on('closed', () => (win = null));
}

function buildMenu() {
  const go = (hash) => () => win && win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [
          { label: 'New Post', accelerator: 'CmdOrCtrl+N', click: () => win && win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'n', modifiers: ['meta'] }) },
          { type: 'separator' },
          { role: 'close' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
      },
      {
        label: 'Go',
        submenu: [
          { label: 'Home', accelerator: 'CmdOrCtrl+1', click: go('#/') },
          { label: 'Explore', accelerator: 'CmdOrCtrl+2', click: go('#/explore') },
          { label: 'Reels', accelerator: 'CmdOrCtrl+3', click: go('#/reels') },
          { label: 'Messages', accelerator: 'CmdOrCtrl+4', click: go('#/direct') },
          { label: 'Hymnal', accelerator: 'CmdOrCtrl+5', click: go('#/hymnal') },
          { type: 'separator' },
          { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => win && win.webContents.navigationHistory.goBack() },
          { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => win && win.webContents.navigationHistory.goForward() },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    const port = await serve();
    origin = `http://localhost:${port}`;
    // Camera and microphone (calls, voice messages), location (the friends' map, churches near
    // you) and notifications, for the app's own pages only.
    session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => {
      const allowed = ['media', 'geolocation', 'notifications', 'clipboard-sanitized-write', 'fullscreen'];
      done(allowed.includes(permission) && isOurs(details.requestingUrl || wc.getURL()));
    });
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (!win) createWindow();
      else win.show();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
