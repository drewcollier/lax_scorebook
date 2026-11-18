// tools/make_pdfs.js - print the guide and the game-day checklist to PDF
// (SCOREKEEPER-STARTUP-GUIDE.pdf, GAME-DAY-CHECKLIST.pdf).
//
// Developer tool. Needs Node.js + Playwright (+ Chrome):
//   python3 tools/build_docs.py     (first, to refresh the guide's HTML)
//   node tools/make_pdfs.js
// Optional env: CHROME (path to Chrome if Playwright's own browser isn't installed)
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const ROOT = path.join(__dirname, '..');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  for (const [html, pdf, opts] of [
    ['SCOREKEEPER-STARTUP-GUIDE.html', 'SCOREKEEPER-STARTUP-GUIDE.pdf', { margin: { top: '0.6in', bottom: '0.6in', left: '0.6in', right: '0.6in' } }],
    ['GAME-DAY-CHECKLIST.html', 'GAME-DAY-CHECKLIST.pdf', { margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' } }],
  ]) {
    await page.goto('file://' + path.join(ROOT, html));
    await page.waitForLoadState('networkidle');
    await page.pdf(Object.assign({ path: path.join(ROOT, pdf), format: 'Letter', printBackground: true }, opts));
    console.log('wrote', pdf);
  }
  await browser.close();
})();
