// UI smoke test for the completeness changes (extras.js catalog/detail/review,
// game.js untouched scoring). Uses a minimal DOM stub; run: node build/test-ui.js
const fs = require('fs'), vm = require('vm');
const R = process.env.HOME + '/workspace/closet-roll/work/';
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.hidden = false; this.open = false; this.value = ''; this._text = ''; this.listeners = {}; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  append(...k) { this.children.push(...k); }
  replaceChildren(...k) { this.children = k; }
  addEventListener(k, f) { this.listeners[k] = f; }
}
const els = {};
['records','archive','recent','book','bookBox','bookFilter','bookSearch','bookCounts','bookMore','viewHome','viewGacha','viewCatalog','viewMypage','tabHome','tabGacha','tabCatalog','tabCloset','tabMypage','detail','detailImg','detailTier','detailSlot','detailBrand','detailName','detailFullName','detailPrice','detailOwn','detailAttrs','detailShop','message','params','bonusChips','closetBox','closetView','closetOpen','closetClose','closetBuilder','closetResultBar','closetResultSlot','appMain','closetSlots','closetPicker','closetJudge','closetReset','closetMode','closetMark','resultTitle','result','reviewFull','honors','rarity','posterArea','moreResult','favorite','challengeStatus'].forEach(id => els[id] = new El('div'));
els.bookFilter.value = 'acquired'; els.bookSearch.value = '';
global.document = { createElement: t => new El(t), addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
global.window = { addEventListener() {}, dispatchEvent() {} };
global.byId = id => els[id];
global.CustomEvent = class {};
const run = f => vm.runInThisContext(fs.readFileSync(R + f, 'utf8'), { filename: f });
run('cards.js'); run('shops.js'); run('attrs.js'); run('score2.js');
vm.runInThisContext(`
const labels=['トップス','ボトムス','シューズ','バッグ','小物'];
const tiers=['N','R','SR','SSR'];
const yen=v=>'¥'+v.toLocaleString('ja-JP');
const names={c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};
function rank(item){const legacy=/^photos\\/([0-3])-([0-3])\\.webp$/.exec(item.img||'');if(legacy)return Number(legacy[2]);return item.price<=4000?0:item.price>=150000?3:item.price>=70000?2:1;}
`);
run('extras.js');
const catalog = vm.runInThisContext('catalog');
const state = vm.runInThisContext('state');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) fails++; };

// 1) Catalog DOM is NOT built while the archive is closed
refreshRecords();
ok(els.book.children.length === 0, 'book DOM empty while archive closed (got ' + els.book.children.length + ')');
ok(els.records.children.length === 1, 'records shows start message when no packs');

// 2) Records grid
state.count = 3; state.high = 88; state.low = 20; state.min = 5000; state.max = 90000;
state.ssr = 1; state.god = 0; state.packs = { jackpot: 1 }; state.titles = ['街角の自由人'];
state.found[catalog[0][0].id] = 2; state.found[catalog[1][0].id] = 1; state.found[catalog[2][5].id] = 1;
refreshRecords();
ok(els.records.children.length >= 11, 'records grid has stat cells (got ' + els.records.children.length + ')');
ok(els.records.children.every(c => c.className === 'stat' || c.className === 'stat wide'), 'records children are .stat cells');

// 3) Still lazy before the catalog view is ever opened (v15: activation
// replaces the old bookBox <details> toggle as the render gate)
els.archive.open = true;
refreshRecords();
ok(els.book.children.length === 0, 'book DOM empty before the catalog view is activated');

// 4) Acquired-first rendering + counts summary (catalog view opened once)
vm.runInThisContext('activateBook()');
renderBook(true);
ok(els.book.children.length === 3, 'acquired view renders only owned items (got ' + els.book.children.length + ')');
ok(els.bookCounts.textContent.includes('収集中 3／1318'), 'counts summary line: ' + els.bookCounts.textContent);

// 5) Incremental paging on "all"
els.bookFilter.value = 'all'; renderBook(true);
ok(els.book.children.length === 50, 'all view first page = 50 (got ' + els.book.children.length + ')');
ok(els.bookMore.hidden === false, 'more button visible');
vm.runInThisContext('bookShown+=50'); renderBook(false); // same steps as the bookMore onclick handler in initExtras
ok(els.book.children.length === 100, 'more button adds 50 (got ' + els.book.children.length + ')');

// 6) Search filters by brand/name
els.bookSearch.value = 'UNIQLO'; renderBook(true);
const expected = catalog.flat().filter(x => (x.brand + ' ' + x.name).toLowerCase().includes('uniqlo')).length;
ok(els.book.children.length === Math.min(50, expected), 'search UNIQLO renders ' + els.book.children.length + ' (expected ' + Math.min(50, expected) + ' of ' + expected + ')');
ok(els.book.children.every(c => c.children[1].children[0].textContent.includes('UNIQLO') || c.children[1].children[1].textContent.toLowerCase().includes('uniqlo')), 'all search results match query');
els.bookSearch.value = ''; els.bookFilter.value = 'acquired';

// 7) Detail sheet: title is the CLEANED display name; the full original
// name stays available on the small sub-line (data itself unchanged).
const displayItemName = vm.runInThisContext('displayItemName');
openDetail(catalog[0][0], 0);
ok(els.detail.hidden === false, 'detail sheet opens');
ok(els.detailName.textContent === displayItemName(catalog[0][0].name), 'detail title is the cleaned display name: ' + els.detailName.textContent);
ok(els.detailFullName.textContent === catalog[0][0].name, 'detail sub-line keeps the FULL original name: ' + els.detailFullName.textContent);
const slot0 = els.detailShop.children[0];
const rows0 = slot0 ? slot0.children.filter(c => c.className === 'shopRow') : [];
const hrefs0 = rows0.map(r => r.children[0].href || '');
ok(els.detailShop.children.length === 1 && rows0.length === 3 && hrefs0.some(h => h.includes('search.rakuten.co.jp')) && hrefs0.some(h => h.includes('amazon.co.jp')) && hrefs0.some(h => h.includes('google.com')), 'detail shop slot shows generated search links only (no invented product pages)');
ok(rows0.every(r => r.children[0].rel === 'noopener'), 'search links are plain (rel=noopener, no sponsored)');
ok(els.detailAttrs.children.length > 0, 'detail shows attribute chips (' + els.detailAttrs.children.length + ')');
closeDetail();
ok(els.detail.hidden === true, 'detail sheet closes');

// 8) コーデ総評 (outfitReview) from score2 reasons
const cheapPlain = catalog.map(g => g.filter(x => x.street.role === 'everyday').sort((a, b) => a.price - b.price)[0]);
const s1 = scoreV2(cheapPlain);
const rev1 = outfitReview(cheapPlain, s1).join('\n');
console.log('  [info] cheap-everyday outfit cls=' + s1.cls + ' overall=' + s1.overall);
ok(rev1.length > 0 && outfitReview(cheapPlain, s1).length >= 3, 'review has >=3 paragraphs');
ok(!/ラグジュアリー性|色彩・柄の相性|基本 \d+点|上限100|＋\d+点/.test(rev1), 'review contains no internal axis names / arithmetic / point tables');
ok(rev1.includes(s1.reasons.hero.brand), 'review mentions the hero item');
if (s1.cls === 'plain') ok(!rev1.includes('ダサい'), 'plain outfit review never says ダサい');
const rev2 = outfitReview(cheapPlain, s1);
ok(rev2.join('\n') !== s1.reasonComment, 'review text differs from the under-score comment (role separation)');

// 9) Parameter bars (7 axes, plain labels) from score.axes
renderParams(s1);
ok(els.params.children.length === 7, 'params renders 7 axis rows (got ' + els.params.children.length + ')');
ok(els.params.children.map(r => r.children[0].textContent).join(',') === '高級感,単体の魅力,色・柄の相性,シルエット,統一感,完成度,個性', 'params labels are plain words in order');
ok(els.params.children.every(r => r.children[2].textContent === String([s1.axes.luxury,s1.axes.appeal,s1.axes.color,s1.axes.silhouette,s1.axes.style,s1.axes.complete,s1.axes.indiv][els.params.children.indexOf(r)])), 'params values match score.axes');

// 10) Bonus chips near the score
renderBonusChips({ bonuses: [['カジュアル統一ボーナス', 2, 'style', 'c'], ['UNIQLO × 3 同ブランドボーナス', 2, 'brand', 'UNIQLO']] });
ok(els.bonusChips.children.length === 2, 'bonus chips render (got ' + els.bonusChips.children.length + ')');
ok(els.bonusChips.children[1].textContent === 'UNIQLO × 3 同ブランドボーナス +2', 'chip text: ' + els.bonusChips.children[1].textContent);
renderBonusChips({ bonuses: [] });
ok(els.bonusChips.children.length === 0, 'no chips when no bonuses');

// 11) Modes: MEN / WOMEN only, default MEN, saved ALL/MIX fall back to MEN
ok(state.mode === 'MEN', 'default mode is MEN (got ' + state.mode + ')');
const preferredMode = vm.runInThisContext('preferredMode');
state.mode = 'WOMEN'; ok(preferredMode() === 'WOMEN', 'preferredMode keeps WOMEN');
state.mode = 'MEN'; ok(preferredMode() === 'MEN', 'preferredMode keeps MEN');
state.mode = 'MIX'; ok(preferredMode() === 'MEN', 'saved MIX falls back to MEN (got ' + preferredMode() + ')');
state.mode = 'ALL'; ok(preferredMode() === 'MEN', 'saved ALL falls back to MEN (got ' + preferredMode() + ')');
state.mode = 'MEN';
const htmlSrc = fs.readFileSync(R + 'index.html', 'utf8');
ok(htmlSrc.includes('data-mode="MEN"') && htmlSrc.includes('data-mode="WOMEN"'), 'mode buttons are MEN / WOMEN');
ok(!htmlSrc.includes('data-mode="MIX"') && !htmlSrc.includes('data-mode="ALL"') && !htmlSrc.includes('>MIX</button>'), 'no MIX / ALL mode button');
const statsSrc = fs.readFileSync(R + 'stats.js', 'utf8');
ok(!statsSrc.includes('"MIX"') && statsSrc.includes('"MEN"') && statsSrc.includes('"WOMEN"'), 'stats.js estimates are MEN/WOMEN only');
const gameSrc = fs.readFileSync(R + 'game.js', 'utf8');
ok(!gameSrc.includes("mode==='MIX'"), 'game.js pool logic has no MIX path');
ok(gameSrc.includes('(ALL|MEN|WOMEN|MIX)'), 'legacy ALL/MIX share links still parse (mode falls back to MEN)');
for (const [mode, g] of [['MEN', 'men'], ['WOMEN', 'women']]) {
  const per = catalog.map(group => group.filter(x => x.gender === g || x.gender === 'unisex').length);
  const total = per.reduce((a, b) => a + b, 0);
  ok(total >= 250 && per.every(n => n >= 25), mode + ' pool healthy: total ' + total + ', per-slot ' + per.join('/'));
}

// 12) Display name cleanup (cards / catalog / detail titles): no display
// name exceeds a sane length or carries the keyword-stuffing patterns;
// search/filter still match the FULL name (checked in section 6 by brand).
{
  const allItems = catalog.flat();
  const tooLong = allItems.filter(it => displayItemName(it.name).length > 36);
  ok(tooLong.length === 0, 'display names all <= 36 chars (worst: ' + (tooLong[0] ? displayItemName(tooLong[0].name) : 'none') + ')');
  const stuffed = allItems.filter(it => /ポケッタブル|サイズ調節可|サイズ調整可/.test(displayItemName(it.name)));
  ok(stuffed.length === 0, 'no display name contains ポケッタブル/サイズ調節可 patterns' + (stuffed[0] ? ': ' + stuffed[0].name : ''));
  const cocaHat = allItems.find(it => it.brand === 'coca' && /バケットハット/.test(it.name) && /ポケッタブル/.test(it.name));
  ok(!!cocaHat, 'coca keyword-stuffed hat exists in catalog');
  if (cocaHat) {
    ok(displayItemName(cocaHat.name) === 'ハット バケットハット', 'coca hat display name cleaned: ' + displayItemName(cocaHat.name));
    openDetail(cocaHat, 4);
    ok(els.detailName.textContent === 'ハット バケットハット', 'coca hat detail title cleaned');
    ok(els.detailFullName.textContent === cocaHat.name, 'coca hat detail sub-line keeps the full stuffed name');
    closeDetail();
  }
  // catalog list rows also use the display name
  els.bookFilter.value = 'all'; els.bookSearch.value = 'バケットハット'; renderBook(true);
  ok(els.book.children.length >= 1 && els.book.children.every(c => !/ポケッタブル|サイズ調節可/.test(c.children[1].children[1].textContent)), 'book rows show cleaned names even when searched by the full stuffed name');
  els.bookSearch.value = ''; els.bookFilter.value = 'acquired';
}

// 13) Review section is open by default (user, 2026-11-24 20:26)
ok(htmlSrc.includes('<details open><summary>先輩コーディネーター・ミレイの総評</summary>'), '総評 details starts open by default, titled by the simplified 先輩コーディネーター label');

// 14) Persona emotion FX wiring (hearts / shake / vignette), widget-safe
{
  const extrasSrc = fs.readFileSync(R + 'extras.js', 'utf8');
  const styleSrc = fs.readFileSync(R + 'style.css', 'utf8');
  ok(extrasSrc.includes('firePersonaFx') && extrasSrc.includes("'hearts'") && extrasSrc.includes("'heartsSoft'"), 'extras plans smitten/flutter heart FX');
  ok(extrasSrc.includes('fxShake') && extrasSrc.includes('fxRagePulse'), 'extras plans rage shake + vignette FX');
  ok(gameSrc.includes('firePersonaFx'), 'game.js finish() fires the persona FX on fresh draws');
  ok(gameSrc.includes("theme==='hearts'") && gameSrc.includes('♥'), 'celebrate() has a hearts theme');
  ok(styleSrc.includes('.particles.hearts') && styleSrc.includes('.fxShake2') && styleSrc.includes('.fxRagePulse'), 'style.css carries the FX classes');
}

// 15) NEW badges (2026-11-24): draw cards badge items not owned before the
// draw; the catalog keeps the badge until the detail sheet is opened once.
{
  const extrasSrc = fs.readFileSync(R + 'extras.js', 'utf8');
  const styleSrc = fs.readFileSync(R + 'style.css', 'utf8');
  ok(gameSrc.includes('newBadge') && gameSrc.includes('isNewItem'), 'game.js card() renders a NEW badge via isNewItem');
  ok(styleSrc.includes('.newBadge'), 'style.css carries the .newBadge pill');
  const isNewItem = vm.runInThisContext('isNewItem');
  const hasUnseenNew = vm.runInThisContext('hasUnseenNew');
  // isolate the collection to a single owned item
  for (const k of Object.keys(state.found)) delete state.found[k];
  for (const k of Object.keys(state.seen)) delete state.seen[k];
  const fresh = catalog[3][10], freshSlot = 3;
  ok(isNewItem(fresh) === true, 'NEW: item not owned before a draw reads as new');
  state.found[fresh.id] = 1;
  ok(isNewItem(fresh) === false, 'NEW: already-owned item never badges on a draw card');
  ok(hasUnseenNew(fresh) === true, 'NEW: owned item keeps the catalog badge until its detail is opened');
  els.bookFilter.value = 'acquired'; els.bookSearch.value = '';
  renderBook(true);
  ok(els.book.children.length === 1, 'NEW: acquired view renders the single owned item');
  const badged = () => els.book.children.length === 1 && els.book.children[0].children[1].children.some(c => c.className === 'newBadge');
  ok(badged(), 'NEW: catalog row shows the NEW badge');
  openDetail(fresh, freshSlot);
  ok(state.seen[fresh.id] === 1, 'NEW: opening the detail marks the item seen (persisted in state)');
  ok(hasUnseenNew(fresh) === false, 'NEW: badge state cleared after opening the detail');
  renderBook(true);
  ok(!badged(), 'NEW: catalog row no longer shows the badge after the detail was opened');
  closeDetail();
}

// 16) My Closet builder （マイクローゼット, 2026-11-24): free-build from
// owned items only, mode lock, judged by the same scoreV2 via the same
// result path - and relief fires here (its intended home) under the cap.
{
  const extrasSrc = fs.readFileSync(R + 'extras.js', 'utf8');
  ok(htmlSrc.includes('id="closetView"') && htmlSrc.includes('マイクローゼット') && htmlSrc.includes('ミレイに診てもらう'), 'index.html carries the My Closet screen');
  ok(extrasSrc.includes('closetJudgeItems') && extrasSrc.includes('closetSet'), 'extras.js carries the closet builder');
  const closetSet = vm.runInThisContext('closetSet');
  const closetResetAll = vm.runInThisContext('closetResetAll');
  const closetJudgeItems = vm.runInThisContext('closetJudgeItems');
  const renderCloset = vm.runInThisContext('renderCloset');
  // A mode-consistent relieved outfit, constructed by the same seeded
  // hill-climb style as build/tests.js but over the MEN-eligible cheap pool
  // (the tests-out reliefBest mixes genders, so the closet's mode lock
  // rightly refuses it - a real player assembles within one mode).
  const mulberry32 = seed => function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rRng = mulberry32(20261125);
  const cheapPool = catalog.map(g => g.filter(it => it.price <= 10000 && (it.gender === 'men' || it.gender === 'unisex')));
  const objR = s => (Math.max(0, 75 - s.axes.harmony) + Math.max(0, 70 - s.axes.complete)) * 100 - s.overall;
  let bestR = null;
  for (let restart = 0; restart < 140; restart++) {
    let items = cheapPool.map(p => p[Math.floor(rRng() * p.length)]);
    let s = scoreV2(items), cur = objR(s);
    for (let step = 0; step < 200; step++) {
      const slot = Math.floor(rRng() * 5);
      const cand = items.slice(); cand[slot] = cheapPool[slot][Math.floor(rRng() * cheapPool[slot].length)];
      const cs = scoreV2(cand); if (cs.total > 30000) continue;
      const cv = objR(cs); if (cv < cur) { items = cand; s = cs; cur = cv; }
    }
    if (s.relief && (!bestR || s.overall > bestR.s.overall)) bestR = { items, s };
  }
  ok(!!bestR, 'closet: a MEN-eligible relieved outfit exists to assemble');
  const rItems = bestR.items;
  closetResetAll();
  ok(closetSet(0, catalog[0].indexOf(rItems[0])) === false, 'closet: unowned item is not selectable');
  ok(closetJudgeItems() === null, 'closet: judging refused while slots are empty');
  for (const it of rItems) state.found[it.id] = (state.found[it.id] || 0) + 1;
  rItems.forEach((it, s) => ok(closetSet(s, catalog[s].indexOf(it)) === true, 'closet: owned item selectable in slot ' + s));
  renderCloset();
  ok(els.closetSlots.children.length === 5, 'closet: renders 5 slot rows (got ' + els.closetSlots.children.length + ')');
  ok(els.closetJudge.disabled === false, 'closet: judge button enabled when all 5 slots are filled');
  const countBefore = state.count;
  const judged = closetJudgeItems();
  ok(!!judged && judged.length === 5, 'closet: judge prepares the 5 chosen items');
  const viaCloset = scoreV2(judged), direct = scoreV2(rItems);
  ok(viaCloset.overall === direct.overall, 'closet: score equals direct scoreV2 (' + viaCloset.overall + ' vs ' + direct.overall + ')');
  ok(viaCloset.relief === true && direct.relief === true, 'closet: relief applies to the constructed cheap outfit');
  ok(viaCloset.overall <= 94, 'closet: relieved closet outfit stays under the 94 cap (got ' + viaCloset.overall + ')');
  ok(vm.runInThisContext('pendingRecord') === '', 'closet: judging is not marked as a draw (nothing recorded)');
  ok(state.count === countBefore, 'closet: draw counter untouched by judging');
  ok(vm.runInThisContext('current') === 'n' + rItems.map((it, s) => catalog[s].indexOf(it)).join('.'), 'closet: outfit encoded exactly like a drawn look (deterministic)');
  // mode lock: MEN outfit refuses WOMEN-only items and vice versa
  closetResetAll();
  const menTop = catalog[0].find(x => x.gender === 'men'), womenBottom = catalog[1].find(x => x.gender === 'women');
  state.found[menTop.id] = (state.found[menTop.id] || 0) + 1; state.found[womenBottom.id] = (state.found[womenBottom.id] || 0) + 1;
  ok(closetSet(0, catalog[0].indexOf(menTop)) === true, 'closet: men-only item selectable first');
  ok(vm.runInThisContext('closetLock()') === 'MEN', 'closet: outfit mode locked to MEN');
  ok(closetSet(1, catalog[1].indexOf(womenBottom)) === false, 'closet: women-only item refused in a MEN outfit');
  closetResetAll();
  ok(vm.runInThisContext('closetLock()') === null, 'closet: reset clears the mode lock');
  renderCloset();
  ok(els.closetJudge.disabled === true, 'closet: judge button disabled while slots are empty');
}


// 17) Closet result differentiation (v13): a closet judging result carries
// the 相談室 header mark / accent / consultation title and NO chance-
// percentile line; a gacha result keeps the percentile and none of the
// closet dressing. The closet section also states results are not recorded.
{
  ok(htmlSrc.includes('id="closetMark"') && htmlSrc.includes('ミレイの相談室'), 'closet UI: index.html carries the 相談室 header mark');
  ok(htmlSrc.includes('id="closetNote"') && htmlSrc.includes('相談結果は記録されません'), 'closet UI: closet section states 相談結果は記録されません');
  const styleSrc2 = fs.readFileSync(R + 'style.css', 'utf8');
  ok(styleSrc2.includes('.closetMark') && styleSrc2.includes('#result.fromCloset'), 'closet UI: style.css carries the closetMark / fromCloset accent');
  const extrasSrc2 = fs.readFileSync(R + 'extras.js', 'utf8');
  ok(extrasSrc2.includes("reviewSource==='closet'"), 'closet UI: resultExtras branches on the closet source');
  const resultExtras = vm.runInThisContext('resultExtras');
  vm.runInThisContext("estimates={MEN:{n:10000,hist:Array.from({length:101},()=>100),special:{}},WOMEN:{n:10000,hist:Array.from({length:101},()=>100),special:{}}}");
  vm.runInThisContext("current='n0.0.0.0.0'");
  const sX = scoreV2(cheapPlain);
  vm.runInThisContext("reviewSource='closet'");
  resultExtras(cheapPlain, sX);
  ok(els.closetMark.hidden === false, 'closet UI: header mark visible on a closet result');
  ok(els.resultTitle.textContent === '相談室のコーデ', 'closet UI: result title names the consultation (got ' + els.resultTitle.textContent + ')');
  ok((els.result.className || '').includes('fromCloset'), 'closet UI: closet result carries the fromCloset accent');
  ok(els.honors.textContent.includes('ミレイの相談室'), 'closet UI: honors line names the consultation room (got ' + els.honors.textContent + ')');
  ok(els.rarity.textContent === '', 'closet UI: closet result shows NO chance-percentile line (got "' + els.rarity.textContent + '")');
  vm.runInThisContext("reviewSource='gacha'");
  resultExtras(cheapPlain, sX);
  ok(els.closetMark.hidden === true, 'closet UI: header mark hidden on a gacha result');
  ok(els.resultTitle.textContent === '今回のコーデ', 'closet UI: gacha result title unchanged (got ' + els.resultTitle.textContent + ')');
  ok(!(els.result.className || '').includes('fromCloset'), 'closet UI: gacha result has no closet accent');
  ok(!els.honors.textContent.includes('相談室'), 'closet UI: gacha honors line unchanged (got ' + els.honors.textContent + ')');
  ok(els.rarity.textContent.includes('MEN') && els.rarity.textContent.includes('約'), 'closet UI: gacha result KEEPS the chance-percentile line (got ' + els.rarity.textContent + ')');
}


// 18) Playtest C/D/E/F (v13): rarity colour-coding in lists, closet row
// layout (fixed button column, ellipsized name), the dedicated closet
// view, and style tag chips at selection time.
{
  const styleSrc3 = fs.readFileSync(R + 'style.css', 'utf8');
  const extrasSrc3 = fs.readFileSync(R + 'extras.js', 'utf8');
  // isolate the collection to one SSR item for list assertions
  for (const k of Object.keys(state.found)) delete state.found[k];
  const ssrItem = catalog.flat().find(x => rank(x) === 3);
  const ssrSlot = catalog.findIndex(g => g.includes(ssrItem));
  state.found[ssrItem.id] = 1;
  // C) catalog list: rarity label carries the gacha colour class + row accent
  els.bookFilter.value = 'acquired'; els.bookSearch.value = '';
  renderBook(true);
  ok(els.book.children.length === 1, 'rarity: acquired view renders the single owned item');
  const row0 = els.book.children[0];
  ok((row0.className || '').includes('rk3'), 'rarity: catalog row carries the rk3 accent class (got ' + row0.className + ')');
  const rarSpan = row0.children[1].children.find(c => (c.className || '').startsWith('rar'));
  ok(!!rarSpan && rarSpan.className === 'rar rar3' && rarSpan.textContent === 'SSR', 'rarity: catalog rarity label is a coloured .rar.rar3 span');
  ok(styleSrc3.includes('.rar3') && styleSrc3.includes('#ffe077') && styleSrc3.includes('.rar1') && styleSrc3.includes('#8bd6ff'), 'rarity: style.css carries the per-tier colours');
  // F) picker chips for a known item with known tags
  const closetResetAll3 = vm.runInThisContext('closetResetAll');
  const closetSet3 = vm.runInThisContext('closetSet');
  const openClosetPicker = vm.runInThisContext('openClosetPicker');
  const target = catalog[0].find(x => x.gender === 'men' || x.gender === 'unisex');
  for (const k of Object.keys(state.found)) delete state.found[k];
  state.found[target.id] = 1;
  closetResetAll3();
  openClosetPicker(0);
  const entries = els.closetPicker.children.filter(c => (c.className || '').includes('bookItem'));
  ok(entries.length === 1, 'tags: picker lists exactly the one owned slot-0 item (got ' + entries.length + ')');
  const ptx = entries[0].children[1];
  const tagRow = ptx.children.find(c => c.className === 'tagRow');
  ok(!!tagRow, 'tags: picker entry renders a tag row');
  ok(!!tagRow && tagRow.children.some(c => c.textContent === names[target.style]), 'tags: picker chips include the primary style ' + names[target.style] + ' (got ' + (tagRow ? tagRow.children.map(c => c.textContent).join('/') : 'none') + ')');
  ok(!!tagRow && tagRow.children.length >= 1 && tagRow.children.length <= 3, 'tags: picker chips capped at 3 (got ' + (tagRow ? tagRow.children.length : 0) + ')');
  ok((entries[0].className || '').includes('rk'), 'rarity: picker row carries the rarity accent class');
  // D) slot row layout: name block before a fixed .closetBtns column
  ok(closetSet3(0, catalog[0].indexOf(target)) === true, 'layout: target item selectable');
  renderCloset();
  const srow = els.closetSlots.children[0];
  const btns = srow.children.find(c => c.className === 'closetBtns');
  ok(!!btns && btns.children.length === 2, 'layout: slot row has a fixed button column with 2 buttons');
  const txIdx = srow.children.findIndex(c => c.className === 'closetTx');
  ok(txIdx >= 0 && txIdx < srow.children.indexOf(btns), 'layout: name block precedes the button column');
  const stx = srow.children[txIdx];
  ok(!!stx.children.find(c => c.className === 'tagRow'), 'tags: filled slot row shows the tag chips under the name');
  ok(!!stx.children.find(c => (c.className || '').startsWith('rar')), 'rarity: filled slot row shows the coloured rarity label');
  ok(styleSrc3.includes('.closetBtns') && styleSrc3.includes('flex:none') && styleSrc3.includes('.closetName') && styleSrc3.includes('text-overflow:ellipsis') && styleSrc3.includes('min-width:0'), 'layout: CSS pins the button column and ellipsizes the name inside its column');
  // E) dedicated closet view: entry/back controls + result inside the view
  ok(htmlSrc.includes('id="closetView"') && htmlSrc.includes('id="tabCloset"') && htmlSrc.includes('data-view="closet"') && htmlSrc.includes('id="closetResultSlot"'), 'closet view: dedicated screen markup exists, entered from the bottom tab bar');
  ok(htmlSrc.includes('id="closetResultBack"') && htmlSrc.includes('← もどる') && !htmlSrc.includes('id="closetClose"') && !htmlSrc.includes('id="closetOpen"') && !htmlSrc.includes('コーデ組みに戻る'), 'back audit: one back pattern (closetResultBack ← もどる), no duplicate back buttons');
  ok(extrasSrc3.includes('openClosetView') && extrasSrc3.includes('closeClosetView') && extrasSrc3.includes('placeResultInCloset'), 'closet view: view-switching functions exist');
  const openClosetView = vm.runInThisContext('openClosetView');
  const closeClosetView = vm.runInThisContext('closeClosetView');
  const placeResultInCloset = vm.runInThisContext('placeResultInCloset');
  openClosetView();
  ok(els.closetView.hidden === false, 'closet view: entry opens the dedicated screen');
  ok((els.appMain.className || '').includes('closetOpen'), 'closet view: main view switches out (closetOpen class)');
  ok(styleSrc3.includes('#tabBar') && htmlSrc.includes('class="view" id="viewHome"') && !styleSrc3.includes('#appMain.closetOpen'), 'closet view: v15 view sections + tab bar carry screen switching (v13 CSS hack removed)');
  ok(vm.runInThisContext('closetSel')[0] === catalog[0].indexOf(target), 'closet view: chosen outfit survives the view switch');
  els.result.parentElement = els.appMain; els.result.nextSibling = null;
  els.appMain.insertBefore = (node) => { els.appMain.children.push(node); };
  placeResultInCloset();
  ok(els.closetResultSlot.children.includes(els.result), 'closet view: judging result renders INSIDE the closet view');
  closeClosetView();
  ok(els.closetView.hidden === true && !(els.appMain.className || '').includes('closetOpen'), 'closet view: back control returns to the main view');
  ok(els.appMain.children.includes(els.result), 'closet view: result section restored to the main view');
  ok(els.result.hidden === true, 'closet view: result hidden after returning to the main view');
  closetResetAll3();
}

// 19) v15 view router: five real views, one visible at a time, bottom
// tab bar, lazy per-view rendering, history-free environments stay safe.
{
  for (const v of ['viewHome','viewGacha','viewCatalog','closetView','viewMypage'])
    ok(htmlSrc.includes('class="view" id="' + v + '"'), 'router: view section #' + v + ' exists');
  ok(htmlSrc.includes('id="tabBar"') && ['home','gacha','catalog','closet','mypage'].every(v => htmlSrc.includes('data-view="' + v + '"')), 'router: tab bar carries the 5 destinations');
  ok(!htmlSrc.includes('id="archive"') && !htmlSrc.includes('id="bookBox"'), 'router: the old archive/bookBox <details> containers are gone');
  const showView = vm.runInThisContext('showView');
  showView('catalog');
  ok(els.viewCatalog.hidden === false && els.viewHome.hidden === true && els.closetView.hidden === true, 'router: showView(catalog) shows exactly the catalog view');
  ok(els.tabCatalog.className === 'on' && els.tabHome.className !== 'on', 'router: active tab is marked');
  ok(vm.runInThisContext('navState.view') === 'catalog', 'router: navState tracks the visible view');
  ok(vm.runInThisContext('bookActivated') === true, 'router: catalog activation is latched (tab switches never rebuild it)');
  showView('mypage');
  ok(els.viewMypage.hidden === false && els.viewCatalog.hidden === true, 'router: showView(mypage) switches views');
  ok(els.records.children.length >= 11, 'router: entering mypage refreshes the records grid');
  showView('gacha');
  ok(els.viewGacha.hidden === false && els.viewMypage.hidden === true, 'router: showView(gacha) switches views');
  showView('home');
  ok(els.viewHome.hidden === false && els.viewGacha.hidden === true, 'router: showView(home) switches views');
  ok(vm.runInThisContext('histOK') === false, 'router: no usable history API in this harness -> pushState skipped safely');
}

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL PASS');
process.exit(fails ? 1 : 0);
