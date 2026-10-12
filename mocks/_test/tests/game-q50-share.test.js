// Real game Q50: the certificate's SHARE button.
// The share card needs a same-origin page (a file:// page taints the canvas and
// it cannot be exported), so this test serves dist/ itself on a free port.
//   1. Where the browser can share files, SHARE opens the share sheet with the
//      1200x630 card (2x) and a line that carries the game's address.
//   2. Where it cannot, SHARE saves the card as a PNG, copies the line, and the
//      button says so for a moment.
// Canvas coordinates: viewport 1280x860. The SHARE button is the left half of
// the first row under the card (read from the hit areas, not hard-coded).
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.json': 'application/json' };

module.exports = async (page, g) => {
  const root = path.resolve('dist');
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://localhost:${server.address().port}/`;

  try {
    const shareButton = async () => page.evaluate(() => {
      // the first hit area under the card whose left half holds SHARE
      const gc = window.__gc;
      const areas = gc.hitAreas.slice().sort((a, b) => a.y - b.y || a.x - b.x);
      const a = areas[0];
      return [a.x + a.w / 2, a.y + a.h / 2];
    });
    const open = async () => {
      await page.goto(base + '?cert=gold&name=Box&hearts=2');
      await page.waitForFunction(() => window.__gc && window.__gc.assetsReady, null, { timeout: 15000 });
      await g.wait(900);
    };

    // ── 1. the share sheet ──────────────────────────────────────────────────
    await page.addInitScript(() => {
      window.__shared = null;
      if (location.hash !== '#noshare') {
        navigator.canShare = (d) => !!(d && d.files && d.files.length);
        navigator.share = async (d) => {
          const f = d.files[0];
          const bmp = await createImageBitmap(f);
          window.__shared = { name: f.name, type: f.type, w: bmp.width, h: bmp.height, text: d.text, title: d.title };
        };
      }
    });
    await open();
    let s = await g.state();
    g.assert(s.level === 50 && s.phase === 'certificate', 'the dev flag opens the certificate: ' + JSON.stringify(s));
    const [sx, sy] = await shareButton();
    await g.click(sx, sy);
    await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
    const shared = await page.evaluate(() => window.__shared);
    g.assert(shared.type === 'image/png' && shared.name === 'OtB-Certificate-Box.png', 'a PNG named for the candidate: ' + JSON.stringify(shared));
    g.assert(shared.w === 2400 && shared.h === 1260, 'the card is 1200x630 at 2x: ' + shared.w + 'x' + shared.h);
    g.assert(shared.text.includes('https://outside-the-box-game.web.app') && shared.text.includes('gold tier') && shared.text.includes('2 of 3 hearts'),
      'the line carries the result and the address: ' + shared.text);
    g.assert(!/—/.test(shared.text), 'no em dashes in the share line');
    await g.shot('shared');

    // ── 2. no file sharing: save the image and copy the line ────────────────
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.slice(0, -1) });
    await page.goto(base + '?cert=gold&name=Box&hearts=2#noshare');
    await page.waitForFunction(() => window.__gc && window.__gc.assetsReady, null, { timeout: 15000 });
    await page.evaluate(() => { delete navigator.share; delete navigator.canShare; Object.defineProperty(navigator, 'share', { value: undefined }); });
    await g.wait(900);
    const [fx, fy] = await shareButton();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      g.click(fx, fy),
    ]);
    g.assert(download.suggestedFilename() === 'OtB-Certificate-Box.png', 'the card is saved: ' + download.suggestedFilename());
    await g.wait(400);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    g.assert(clip.includes('https://outside-the-box-game.web.app'), 'the line is copied: ' + clip);
    await g.shot('saved-and-copied');
  } finally {
    server.close();
  }
};
