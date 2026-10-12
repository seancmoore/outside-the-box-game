// Playwright harness for the REAL game build (dist/index.html) via the window.__gc dev hook.
// Usage: node mocks/_test/game.js <test.js> [--dark]     or     node mocks/_test/game.js --shot <level> [name]
// Test file exports async (page, g) => {}; g helpers: goto(level), state(), click(x,y), rclick, down/move/up, drag, key/keyDown/keyUp, type,
// wait, shot(name), eval(fn,arg), assert, chrome(). The viewport is 1280x860 so canvas coordinates equal the mock frame coordinates.
const { chromium } = require('C:/Users/panky/portfolio/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
const args = argv.filter(a => !a.startsWith('--'));
const outDir = path.resolve(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  // Falls back to the system Edge when Playwright's own Chromium isn't downloaded.
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'msedge' }));
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const pageErrors = [], consoleErrors = [], failedRequests = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('requestfailed', r => failedRequests.push(r.url()));
  page.on('dialog', async d => { consoleErrors.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.__gc && window.__gc.assetsReady, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);

  let shotN = 0;
  const name = args[0] ? path.basename(args[0], '.test.js') : 'game';
  const g = {
    page,
    goto: async (level, opts = {}) => {
      await page.evaluate(([lvl, o]) => {
        const gc = window.__gc; const st = gc.state;
        st.currentScreen = 'level'; st.currentLevel = lvl; st.lives = 3; st.paused = false; st.gameOver = false; st.controlsOpen = false;
        st.levelSubPhase = ''; st.playMode = o.play ? 'play' : 'levelselect'; st.playerName = o.name || 'Box';
        st.examStartTime = o.play ? performance.now() : 0; st.level21IntroSeen = false; st.darkMode = !!o.dark;
        gc.render();
      }, [level, opts]);
      await page.waitForTimeout(350);
    },
    state: async () => page.evaluate(() => { const gc = window.__gc; const s = gc.state; const lines = s.guideLines || (gc.resolveGuide ? gc.resolveGuide() : []); return { level: s.currentLevel, screen: s.currentScreen, lives: s.lives, phase: s.levelSubPhase, paused: s.paused, gameOver: s.gameOver, dark: s.darkMode, remarks: lines.join(' | '), reveal: s.guideReveal, stamp: s.fxStampText, caption: s.paperCaption }; }),
    chrome: async () => page.evaluate(() => JSON.parse(JSON.stringify(window.__gc.chrome))),
    click: async (x, y, opts = {}) => { await page.mouse.click(x, y, opts); },
    rclick: async (x, y) => { await page.mouse.click(x, y, { button: 'right' }); },
    dblclick: async (x, y) => { await page.mouse.dblclick(x, y); },
    down: async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); },
    move: async (x, y, steps = 12) => { await page.mouse.move(x, y, { steps }); },
    up: async () => { await page.mouse.up(); },
    drag: async (x0, y0, x1, y1, steps = 20) => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); await page.mouse.up(); },
    key: async (k) => { await page.keyboard.press(k); },
    keyDown: async (k) => { await page.keyboard.down(k); },
    keyUp: async (k) => { await page.keyboard.up(k); },
    type: async (t) => { await page.keyboard.type(t); },
    wait: async (ms) => { await page.waitForTimeout(ms); },
    shot: async (n) => { const p = path.join(outDir, `game-${name}-${String(++shotN).padStart(2, '0')}-${n}.png`); await page.screenshot({ path: p }); return p; },
    eval: async (fn, arg) => page.evaluate(fn, arg),
    assert: (c, m) => { if (!c) throw new Error('ASSERT: ' + m); },
    levelVar: async (expr) => page.evaluate((e) => { try { return eval('window.__gc.lv && window.__gc.lv.' + e); } catch (x) { return undefined; } }, expr),
  };

  const result = { test: args[0] || null, pass: true, error: null, pageErrors, consoleErrors, failedRequests };
  try {
    if (flags.shot) {
      await g.goto(Number(flags.shot), { dark: !!flags.dark });
      await g.wait(600);
      await g.shot(args[0] || ('level' + flags.shot));
    } else if (args[0]) {
      const fn = require(path.resolve(args[0]));
      await fn(page, g);
    }
  } catch (e) { result.pass = false; result.error = e.stack || String(e); }
  await browser.close();
  if (pageErrors.length) result.pass = false;
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
