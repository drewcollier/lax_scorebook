// Player pickers in jersey order; players with no jersey last (app V3.36).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await (await browser.newContext({ viewport: { width: 700, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.goto('http://localhost:8769/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => {
    // roster in the order it came from the Sheet, as in the screenshot: some blank numbers
    const r = [['16', 'A Sixteen'], ['13', 'B Thirteen'], ['26', 'C TwentySix'], ['10', 'D Ten'], ['', 'Zed NoNumber'], ['', 'Abe NoNumber'],
      ['66', 'E SixtySix'], ['29', 'F TwentyNine'], ['51', 'G FiftyOne'], [' ', 'Space Only'], ['25', 'H TwentyFive'], ['00', 'I DoubleZero'],
      ['0', 'J Zero'], ['3', 'K Three'], ['42', 'L FortyTwo'], ['44', 'M FortyFour'], [null, 'Null Jersey']];
    state.players = r.map((x, i) => ({ Player_ID: 'P' + (i + 1), Jersey: x[0], Name: x[1], Position: i === 3 ? 'Goalie' : 'Attack' }));
    saveState();
    document.getElementById('setupOpponent').value = 'Carmel'; openGameMetaModal(); finalizeStartGame();
  });
  const order = ['#0', '#00', '#3', '#10', '#13', '#16', '#25', '#26', '#29', '#42', '#44', '#51', '#66'];
  const noNum = ['Abe NoNumber', 'Null Jersey', 'Space Only', 'Zed NoNumber'];
  // penalty picker
  await page.evaluate(() => openPenaltyModal ? openPenaltyModal() : null).catch(() => {});
  await page.evaluate(() => { state.penaltyTeam = 'tigers'; renderPenaltyPlayerList(); });
  let items = await page.$$eval('#penaltyPlayerList > div', (d) => d.map((x) => x.textContent));
  check('penalty picker: jersey numbers in order (0, 00, 3, 10, 13 …)', JSON.stringify(items.slice(0, 13)) === JSON.stringify(order), items);
  check('…then a "No jersey number" heading and those players by name, at the bottom', items[13] === 'No jersey number in the roster' && JSON.stringify(items.slice(14)) === JSON.stringify(noNum), items.slice(13));
  check('…no blank buttons', items.every((t) => t.trim() !== '' && t !== '#'));
  await page.evaluate(() => { Array.from(document.querySelectorAll('#penaltyPlayerList > div')).filter((d) => d.textContent === '#13')[0].click(); });
  check('picking #13 picks the right player', await page.evaluate(() => state.selectedPenaltyPlayer && state.selectedPenaltyPlayer.Name === 'B Thirteen'));
  // assist picker (scorer #10 left out)
  await page.evaluate(() => { state.assistScorerId = 'P4'; state.assistGoalIds = []; assistAnswer && assistAnswer(true); });
  items = await page.$$eval('#assistPlayerList > div', (d) => d.map((x) => x.textContent));
  check('assist picker: same order, scorer left out', items.length > 0 && items.indexOf('#10') < 0 && items[0] === '#0' && items[1] === '#00' && items[2] === '#3' && items[12] === 'No jersey number in the roster', items);
  // ejection list
  await page.evaluate(() => openEjectionModal());
  items = await page.$$eval('#ejectionPlayerList > div', (d) => d.map((x) => x.textContent));
  check('ejection list: in jersey order, no-number players last with "(no #)"', items[0] === '#0 J Zero' && items[1] === '#00 I DoubleZero' && items[12] === '#66 E SixtySix' && items[13] === '(no #) Abe NoNumber', items);
  await page.evaluate(() => closeEjectionModal());
  // by-player grid and the keypad grid
  await page.evaluate(() => { state.currentFilter = 'All'; renderPlayerGrid && renderPlayerGrid(); });
  const grid = await page.evaluate(() => getFilteredPlayers().map((p) => p.Name));
  check('By Player grid in jersey order, no-number players last', grid[0] === 'J Zero' && grid[2] === 'K Three' && grid.slice(-4).join() === noNum.join(), grid);
  // roster tab
  await page.evaluate(() => document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')));
  await page.click('.tab-btn[data-tab="roster"]');
  const roster = await page.$$eval('#rosterList .jersey-num', (d) => d.map((x) => x.textContent));
  check('Roster tab: numbers in order, blanks last', roster[0] === '#0' && roster[1] === '#00' && roster[12] === '#66' && roster.slice(13).every((t) => t.trim() === '#' || t.trim() === '#null' || /^#\s*$/.test(t)), roster);
  await page.click('.tab-btn[data-tab="game"]');
  await page.evaluate(() => { document.getElementById('penaltyModal') && document.getElementById('penaltyModal').classList.add('show'); state.penaltyTeam = 'tigers'; renderPenaltyPlayerList(); });
  await page.screenshot({ path: '/tmp/jersey.png' });
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
