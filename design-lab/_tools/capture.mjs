// 방향마다 390px 스크린샷 두 장(홈 · 상세 첫 화면, 2배)과 모션 녹화(약 9초 webm)를 뜬다.
// 사용: node capture.mjs <design-lab 경로> <출력 경로> [방향…]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path';
const [lab, out, ...only] = process.argv.slice(2);
const dirs = fs.readdirSync(lab).filter(d => /^\d\d-/.test(d) && (!only.length || only.includes(d)));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const vp = { width: 390, height: 844 };
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const d of dirs) {
  const url = 'file://' + path.resolve(lab, d, 'index.html');
  fs.mkdirSync(path.join(out, d), { recursive: true });
  // 스크린샷 — 등장 모션이 끝난 뒤
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(url, { waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready); await wait(2600);
  await pg.screenshot({ path: path.join(out, d, 'home.png') });
  await pg.goto(url + '#detail', { waitUntil: 'networkidle' }); await pg.reload({ waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready); await wait(2600);
  await pg.screenshot({ path: path.join(out, d, 'detail.png') });
  // 상세 전체(첫 화면 아래까지) — 안쪽 스크롤을 풀어 한 장으로
  await pg.addStyleTag({ content: '.phone{height:auto!important;max-height:none!important}.screen.on{position:relative!important;overflow:visible!important}.tabs{display:none!important}' });
  await wait(300);
  await pg.screenshot({ path: path.join(out, d, 'detail-full.png'), fullPage: true });
  await ctx.close();
  // 녹화 — 첫 등장 → 관심 누름(상태 바뀜) → 카드 → 상세(화면 이동) → 묶음 접고 펼침 → 뒤로
  const vctx = await browser.newContext({ viewport: vp, recordVideo: { dir: path.join(out, d, 'v'), size: vp } });
  const vp2 = await vctx.newPage();
  await vp2.goto(url, { waitUntil: 'networkidle' }); await vp2.evaluate(() => document.fonts.ready);
  await wait(2200);
  const fav = vp2.locator('.screen.on [data-fav]').nth(1);
  if (await fav.count()) { await fav.click(); await wait(800); }
  await vp2.locator('[data-open]').first().click(); await wait(2000);
  const tg = vp2.locator('.screen.on [data-toggle]').first();
  if (await tg.count()) { await tg.scrollIntoViewIfNeeded(); await wait(300); await tg.click(); await wait(700); await tg.click(); await wait(900); }
  await vp2.locator('.screen.on [data-back]').first().click(); await wait(1500);
  const vid = vp2.video(); await vctx.close();
  fs.renameSync(await vid.path(), path.join(out, d, 'motion.webm'));
  fs.rmSync(path.join(out, d, 'v'), { recursive: true, force: true });
  console.log(d, errs.length ? 'ERR ' + errs.join(' | ') : 'ok');
}
await browser.close();
