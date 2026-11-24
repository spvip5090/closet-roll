// v14 test (2026-11-24): three workstreams.
//  WS1 editorial reskin - static checks on style.css / index.html tokens
//      (paper/ink/red palette, serif stack, masthead, deepened rarity text,
//      old dark-purple surfaces gone).
//  WS2 review length variance - seeded length modes: SHORT ~12% (1-2
//      lines), LONG ~10% (one extra observation line), STANDARD otherwise;
//      rage line counts unchanged; same outfit+state => same review.
//  WS3 Mirei's memory - memory lines fire ONLY when their factual
//      precondition holds in state (comparison / repeat item / streaks /
//      collection milestones / first SSR / closet history), at most one
//      per review, ~40-50% of eligible reviews; fresh state => zero.
// Run: node build/test-v14.js (after build/tests.js regenerated tests-out.json)
const fs = require('fs'), vm = require('vm');
const { mulberry32 } = require('./load.js'); // catalog, scoreV2, s2attr, rank globals
const R = process.env.HOME + '/workspace/closet-roll/';
const W = R + 'work/';
global.document = { createElement: () => ({ style: {}, dataset: {}, children: [], append() {}, replaceChildren() {}, addEventListener() {} }), addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
global.window = { addEventListener() {}, dispatchEvent() {} };
global.byId = () => ({ textContent: '', children: [], append() {}, replaceChildren() {}, addEventListener() {} });
global.CustomEvent = class {};
vm.runInThisContext(`
if(typeof yen==='undefined') globalThis.yen=v=>'¥'+v.toLocaleString('ja-JP');
if(typeof names==='undefined') globalThis.names={c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};
`);
vm.runInThisContext(fs.readFileSync(W + 'extras.js', 'utf8'), { filename: 'extras.js' });
const grab = n => vm.runInThisContext(n);
const outfitReview = grab('outfitReview');
const scoreV2 = grab('scoreV2');
const s2tier = grab('s2tier');
const personaTier = grab('personaTier');
const personaOffense = grab('personaOffense');
const itemKey = grab('itemKey');
const state = grab('state');
const catalog = grab('catalog');
const labels = grab('labels');

let pass = 0, fail = 0; const failures = [];
function assert(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }

// ---------- WS1: editorial reskin (static) ----------
{
  const css = fs.readFileSync(W + 'style.css', 'utf8');
  const html = fs.readFileSync(W + 'index.html', 'utf8');
  assert(css.includes('#faf7f1'), 'WS1: paper token #faf7f1 present');
  assert(css.includes('#c8102e'), 'WS1: red accent #c8102e present');
  assert(css.includes('Hiragino Mincho ProN') && css.includes('Yu Mincho'), 'WS1: serif display stack present');
  assert(!css.includes('#121021') && !css.includes('#282136') && !css.includes('#241c33'), 'WS1: old dark-purple surfaces gone');
  assert(css.includes('.rar3') && css.includes('#a87b00'), 'WS1: SSR text deepened to amber #a87b00');
  assert(css.includes('.rar1') && css.includes('#0b6fae'), 'WS1: R text deepened to #0b6fae');
  assert(css.includes('.particles.hearts') && css.includes('#f2668f'), 'WS1: hearts deepened pink for light bg');
  assert(css.includes('.closetMark') && css.includes('#result.fromCloset'), 'WS1: closet section-label treatment present');
  assert(html.includes('class="masthead"') && html.includes('id="issueLine"'), 'WS1: masthead with issue line in index.html');
  assert(html.includes('#faf7f1'), 'WS1: theme-color matches paper');
}

// ---------- shared helpers ----------
const POOL = n => grab(n);
const memLinesOf = poolNames => {
  const set = new Set();
  for (const n of poolNames) for (const l of POOL(n)) for (const lab of labels) set.add(l.replace('__SLOT__', lab));
  return set;
};
const ALL_MEM = memLinesOf(['MEM_CMP_UP', 'MEM_CMP_DOWN', 'MEM_CMP_TIE', 'MEM_REPEAT', 'MEM_STREAK_HI', 'MEM_STREAK_LO', 'MEM_MILESTONE', 'MEM_FIRST_SSR', 'MEM_CLOSET_UP', 'MEM_CLOSET_DOWN', 'MEM_CLOSET_TIE']);
const memIn = review => review.filter(l => ALL_MEM.has(l));
function resetState(patch) {
  Object.assign(state, { count: 0, recent: [], found: {}, ssr: 0, closetCount: 0, closetLast: null }, patch || {});
}
const rng = mulberry32(20261124);
const randOutfit = () => catalog.map(g => g[Math.floor(rng() * g.length)]);
const tierOf = (items, s) => personaTier(s, personaOffense(items, s));

// ---------- WS2: length distribution + rage stability + determinism ----------
{
  resetState();
  const N = 4000; let nonRage = 0, short = 0, long = 0, std = 0;
  const oneLiners = new Set([...POOL('SHORT_ONE_BORED'), ...POOL('SHORT_ONE_SMITTEN')]);
  const extraTemplates = ['EXTRA_PRAISE', 'EXTRA_FLUTTER', 'EXTRA_SMITTEN', 'EXTRA_MAX', 'EXTRA_BAND', 'EXTRA_BORED', 'EXTRA_SCOLD', 'EXTRA_DAILY']
    .flatMap(n => POOL(n));
  const extraRes = extraTemplates.map(t => new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('__ITEM2__', '.+') + '$'));
  let rageSeen = 0;
  for (let k = 0; k < N; k++) {
    const items = randOutfit(); const s = scoreV2(items); const tier = tierOf(items, s);
    const rev = outfitReview(items, s);
    if (tier === 'rage') { rageSeen++; assert([3, 4, 6].includes(rev.length), `WS2: rage review length must stay 3/4/6, got ${rev.length}`); continue; }
    nonRage++;
    if (rev.length < 3) {
      short++;
      if (rev.length === 1) assert(oneLiners.has(rev[0]), 'WS2: 1-line review must come from a SHORT one-liner pool: ' + rev[0]);
    } else if (rev.length === 4) {
      long++;
      assert(extraRes.some(re => re.test(rev[2])), 'WS2: LONG extra line must come from an EXTRA pool: ' + rev[2]);
    } else std++;
    assert(rev.length >= 1 && rev.length <= 4, `WS2: non-rage review length 1-4, got ${rev.length}`);
  }
  const shortShare = short / nonRage, longShare = long / nonRage;
  assert(shortShare > 0.07 && shortShare < 0.19, `WS2: SHORT share in band, got ${(shortShare * 100).toFixed(1)}%`);
  assert(longShare > 0.05 && longShare < 0.16, `WS2: LONG share in band, got ${(longShare * 100).toFixed(1)}%`);
  assert(std / nonRage > 0.6, 'WS2: STANDARD remains the majority shape');
  assert(rageSeen > 50, 'WS2: rage outfits sampled, got ' + rageSeen);
  // determinism: same outfit + same state => identical review, twice
  resetState({ count: 3, recent: [{ code: 'zz', score: 55 }] });
  for (let k = 0; k < 60; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    const a = outfitReview(items, s), b = outfitReview(items, s);
    assert(a.join('\n') === b.join('\n'), 'WS2/WS3: determinism broken for an outfit');
  }
  console.log(`  [info] WS2 distribution over ${nonRage} non-rage reviews: SHORT ${(shortShare * 100).toFixed(1)}%, LONG ${(longShare * 100).toFixed(1)}%, STANDARD ${(100 * std / nonRage).toFixed(1)}%`);
}

// ---------- WS3: memory scenarios ----------
// S0: fresh state => zero memory lines, even with SSR items in the outfit
{
  resetState();
  let checked = 0;
  for (let k = 0; k < 120; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    const rev = outfitReview(items, s);
    assert(memIn(rev).length === 0, 'WS3 S0: fresh state produced a memory line: ' + rev.join(' / '));
    checked++;
  }
  assert(checked === 120, 'WS3 S0: sample size');
}
// S1: score comparison direction is always truthful
{
  resetState({ count: 5, recent: [{ code: 'zz', score: 30 }], ssr: 99 });
  const UP = memLinesOf(['MEM_CMP_UP']), DOWN = memLinesOf(['MEM_CMP_DOWN']), TIE = memLinesOf(['MEM_CMP_TIE']);
  const STREAK_LO = memLinesOf(['MEM_STREAK_LO']); // prev 30 < 40: sub-40 outfits also arm the low streak
  let fired = 0, eligible = 0;
  for (let k = 0; k < 300; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    if (tierOf(items, s) === 'rage' || s.overall >= 100) continue;
    eligible++;
    const mem = memIn(outfitReview(items, s));
    assert(mem.length <= 1, 'WS3: at most one memory line per review');
    if (mem.length) {
      fired++;
      const want = s.overall > 30 ? UP : s.overall < 30 ? DOWN : TIE;
      assert(want.has(mem[0]) || (s.overall < 40 && STREAK_LO.has(mem[0])), `WS3 S1: wrong memory class/direction for score ${s.overall} vs prev 30: ${mem[0]}`);
    }
  }
  const rate = fired / eligible;
  assert(rate > 0.3 && rate < 0.6, `WS3 S1: firing rate in 40-50% band (slack), got ${(rate * 100).toFixed(1)}%`);
  console.log(`  [info] WS3 comparison scenario: ${fired}/${eligible} fired (${(rate * 100).toFixed(1)}%)`);
}
// S2/S3: streaks
{
  const HI = memLinesOf(['MEM_STREAK_HI']), LO = memLinesOf(['MEM_STREAK_LO']);
  resetState({ count: 6, recent: [{ code: 'zz', score: 90 }], ssr: 99 });
  let hi = 0;
  for (let k = 0; k < 400 && hi < 3; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    if (s.overall < 85 || tierOf(items, s) === 'rage') continue;
    if (memIn(outfitReview(items, s)).some(l => HI.has(l))) hi++;
  }
  assert(hi >= 1, 'WS3 S2: high streak line never fired');
  resetState({ count: 6, recent: [{ code: 'zz', score: 20 }], ssr: 99 });
  let lo = 0;
  for (let k = 0; k < 400 && lo < 3; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    if (s.overall >= 40 || tierOf(items, s) === 'rage') continue;
    if (memIn(outfitReview(items, s)).some(l => LO.has(l))) lo++;
  }
  assert(lo >= 1, 'WS3 S3: low streak line never fired');
}
// S4: collection milestone crossing (24 owned + new outfit crosses 25)
{
  const MS = memLinesOf(['MEM_MILESTONE']);
  const owned24 = {};
  outer: for (const g of catalog) for (const it of g) { if (Object.keys(owned24).length >= 24) break outer; owned24[itemKey(it)] = 1; }
  const freshLists = catalog.map(g => g.filter(it => !owned24[itemKey(it)]));
  resetState({ count: 5, found: owned24, ssr: 99 });
  let fired = 0;
  for (let k = 0; k < 40; k++) {
    const items = freshLists.map((list, i) => list[(k * 13 + i * 7) % list.length]);
    const mem = memIn(outfitReview(items, scoreV2(items)));
    for (const l of mem) assert(MS.has(l), 'WS3 S4: only milestone lines may fire here: ' + l);
    if (mem.length) fired++;
  }
  assert(fired >= 1, 'WS3 S4: milestone line never fired on a crossing draw');
  // no crossing (already past the threshold) => silent
  const owned30 = {}; let c = 0;
  for (const g of catalog) for (const it of g) { if (c++ >= 30) break; owned30[itemKey(it)] = 1; }
  resetState({ count: 9, found: owned30, ssr: 99 });
  for (let k = 0; k < 40; k++) {
    const items = randOutfit();
    assert(memIn(outfitReview(items, scoreV2(items))).length === 0, 'WS3 S4: memory fired with no precondition');
  }
}
// S5: first-ever SSR
{
  const FS = memLinesOf(['MEM_FIRST_SSR']);
  const ssrItem = catalog.flat().find(it => grab('rank')(it) === 3);
  assert(!!ssrItem, 'WS3 S5: catalog has an SSR item');
  const slot = catalog.findIndex(g => g.includes(ssrItem));
  const base = [catalog[0][0], catalog[1][0], catalog[2][0], catalog[3][0], catalog[4][0]];
  resetState({ count: 3, ssr: 0 });
  let fired = 0;
  for (let k = 0; k < 40; k++) {
    const items = base.map((x, i) => i === slot ? ssrItem : catalog[i][k % catalog[i].length]);
    const mem = memIn(outfitReview(items, scoreV2(items)));
    for (const l of mem) assert(FS.has(l), 'WS3 S5: only first-SSR lines may fire here: ' + l);
    if (mem.length) fired++;
  }
  assert(fired >= 1, 'WS3 S5: first-SSR line never fired');
  resetState({ count: 3, ssr: 1 });
  const items = base.map((x, i) => i === slot ? ssrItem : x);
  assert(!memIn(outfitReview(items, scoreV2(items))).some(l => FS.has(l)), 'WS3 S5: first-SSR fired when ssr count already 1');
}
// S6: repeat item callout (same bag in the previous outfit)
{
  const REP = memLinesOf(['MEM_REPEAT']), TIE = memLinesOf(['MEM_CMP_TIE']);
  let fired = 0, checked = 0;
  for (let k = 0; k < 60 && checked < 30; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    if (tierOf(items, s) === 'rage' || s.overall >= 100) continue;
    const code = 'g' + items.map((it, i) => catalog[i].indexOf(it)).join('.');
    resetState({ count: 4, recent: [{ code, score: s.overall }], ssr: 99 });
    // same code in recent == the restored-same-outfit guard would block the
    // comparison, so shift one slot to a different item: repeat stays armed
    // via the other four slots.
    const items2 = items.map((it, i) => i === 0 ? catalog[0][(catalog[0].indexOf(it) + 1) % catalog[0].length] : it);
    const s2 = scoreV2(items2);
    state.recent = [{ code, score: s2.overall }];
    const mem = memIn(outfitReview(items2, s2));
    for (const l of mem) assert(REP.has(l) || TIE.has(l), 'WS3 S6: unexpected memory class: ' + l);
    if (mem.some(l => REP.has(l))) fired++;
    checked++;
  }
  assert(fired >= 1, 'WS3 S6: repeat-item line never fired');
}
// S7: closet memory (direction vs last closet score; none before any judging)
{
  const CUP = memLinesOf(['MEM_CLOSET_UP']);
  resetState({ closetCount: 2, closetLast: 30, ssr: 99 });
  let fired = 0;
  for (let k = 0; k < 200; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    if (s.overall <= 30 || tierOf(items, s) === 'rage') continue;
    const mem = memIn(outfitReview(items, s, 'closet'));
    for (const l of mem) assert(CUP.has(l), 'WS3 S7: only closet-up lines may fire here: ' + l);
    if (mem.length) fired++;
    if (fired >= 2) break;
  }
  assert(fired >= 1, 'WS3 S7: closet memory line never fired');
  resetState({ closetCount: 0, closetLast: null, ssr: 99 });
  for (let k = 0; k < 40; k++) {
    const items = randOutfit();
    assert(memIn(outfitReview(items, scoreV2(items), 'closet')).length === 0, 'WS3 S7: closet memory fired before any closet judging');
  }
}
// S8: rage and 100-point reviews never carry memory, even with rich state
{
  resetState({ count: 9, recent: [{ code: 'zz', score: 60 }], ssr: 0 });
  let rageChecked = 0;
  for (let k = 0; k < 3000 && rageChecked < 25; k++) {
    const items = randOutfit(); const s = scoreV2(items);
    if (tierOf(items, s) !== 'rage') continue;
    const rev = outfitReview(items, s);
    assert(memIn(rev).length === 0, 'WS3 S8: memory line inside a rage review');
    rageChecked++;
  }
  assert(rageChecked >= 10, 'WS3 S8: rage outfits sampled, got ' + rageChecked);
  const testsOut = JSON.parse(fs.readFileSync(R + 'build/tests-out.json', 'utf8'));
  const findItem = (slot, text) => { const nm = text.split(': ')[1].replace(/ ¥[\d,]+$/, ''); return catalog[slot].find(it => (it.brand + ' ' + it.name) === nm); };
  const rec100 = testsOut.patterns.find(r => r.name === '高額でオシャレ' && r.found);
  if (rec100) {
    const items100 = rec100.items.map((t, i) => findItem(i, t));
    if (items100.every(Boolean)) {
      const s100 = scoreV2(items100);
      assert(s100.overall === 100, 'WS3 S8: 100pt pattern intact');
      assert(memIn(outfitReview(items100, s100)).length === 0, 'WS3 S8: memory line inside a 100-point review');
    }
  }
}


// ---------- WS4: scoring accuracy (coherence / rarity as scored value) ----------
// The user's playtest case: a natural all-Rick-Owens brand pack (4xSSR +
// 1xSR, all mode) scored 88 with unity 70 / indiv 17 / complete 62 under
// the v13 engine. The axis fixes (brand count in the unity axis, brand-
// identity + worldview indiv floors, all-SR+ completeness credit,
// uniform exemption from the indiv cap, mean+floor rarity bonus) must
// land it at 95+ as a stylish, smitten-eligible triumph.
{
  const byName = (slot, nm) => catalog[slot].find(x => x.name.includes(nm));
  const rick = ['LARRY FOGPOCKET SHIRT', 'MASTODON CARGO', 'MEGA BUMPER GEOBASKET', 'GEMINI BAG', 'GIGLIO MEGA'].map((nm, i) => byName(i, nm));
  assert(rick.every(Boolean), 'WS4: rick outfit reconstruction failed');
  const s = scoreV2(rick);
  assert(s.overall >= 95, 'WS4: rick uniform must land 95+, got ' + s.overall);
  assert(s.cls === 'stylish', 'WS4: rick uniform must classify stylish, got ' + s.cls);
  assert(s.axes.style >= 85, 'WS4: rick unity axis must be mid-80s+, got ' + s.axes.style);
  assert(s.axes.indiv >= 28, 'WS4: rick indiv must not crater, got ' + s.axes.indiv);
  assert(s.axes.complete >= 70, 'WS4: rick completeness must credit the all-SR+ set, got ' + s.axes.complete);
  assert(personaTier(s, personaOffense(rick, s)) === 'smitten', 'WS4: rick uniform must be smitten-eligible');
  // uniform exemption from the indiv<28 cap: OUR LEGACY uniform has
  // indiv 24 (casual-style brand, no identity floor) yet must not be
  // silently capped - brand uniformity is its character.
  const s2a = vm.runInThisContext('s2attr');
  const ol = catalog.map((g, sl) => g.filter(it => it.brand === 'OUR LEGACY').sort((a, b) => s2a(b)[12] - s2a(a)[12])[0]);
  assert(ol.every(Boolean), 'WS4: OUR LEGACY uniform reconstruction failed');
  const so = scoreV2(ol);
  assert(so.axes.indiv < 28 && so.overall >= 90, `WS4: uniform cap exemption failed (indiv ${so.axes.indiv}, overall ${so.overall})`);
  // price ladder: same coherence class, three price tiers must order
  const NEUT = new Set([0, 1, 2, 3, 4, 5, 14, 16]);
  const ladder = (lo, hi) => { const used = new Set(); return catalog.map((g, sl) => {
    let xs = g.filter(x => x.style === 'e' && NEUT.has(s2a(x)[0]) && x.price >= lo && x.price <= hi && !used.has(x.brand));
    if (!xs.length) xs = g.filter(x => NEUT.has(s2a(x)[0]) && x.price >= lo && x.price <= hi && !used.has(x.brand));
    const it = xs.sort((a, b) => s2a(b)[12] - s2a(a)[12])[0]; used.add(it.brand); return it; }); };
  const lHi = scoreV2(ladder(80000, Infinity)).overall, lMid = scoreV2(ladder(12000, 60000)).overall, lLow = scoreV2(ladder(0, 12000)).overall;
  assert(lHi > lMid && lMid > lLow, `WS4: price ladder must order high>mid>low, got ${lHi}/${lMid}/${lLow}`);
  // money vs coherence: a genuinely clashing luxury set stays broken and
  // bonus-less, far below the coherent cheap relief outfit.
  const byAssert = (a, b) => s2a(b)[11] - s2a(a)[11] || b.price - a.price;
  const byPrice = (a, b) => b.price - a.price;
  const pk = (sl, pred, sort) => { const xs = catalog[sl].filter(pred); return xs.length ? xs.slice().sort(sort)[0] : null; };
  const clash = [
    pk(0, x => x.street && x.street.role === 'statement' && x.style === 'e' && x.price >= 50000, byAssert),
    pk(1, x => x.street && x.street.role === 'statement' && x.style === 'p' && x.price >= 50000, byAssert),
    pk(2, x => s2a(x)[5] >= 2, byPrice),
    pk(3, x => s2a(x)[0] && !NEUT.has(s2a(x)[0]) && x.price >= 30000, byPrice),
    pk(4, x => s2a(x)[5] >= 2, byPrice),
  ];
  assert(clash.every(Boolean), 'WS4: clash construction failed');
  const sc = scoreV2(clash);
  assert(sc.overall < 55 && sc.bonuses.length === 0, `WS4: clashing luxury must stay <55 with no bonuses, got ${sc.overall}/+${sc.bonuses.length}`);
  const rb = JSON.parse(fs.readFileSync(R + 'build/tests-out.json', 'utf8')).reliefBest;
  const chic = rb.items.map((t, i) => { const nm = t.split(': ')[1].replace(/ ¥[\d,]+$/, ''); return catalog[i].find(it => (it.brand + ' ' + it.name) === nm); });
  const schic = scoreV2(chic);
  assert(schic.overall > sc.overall + 30, `WS4: coherent cheap (${schic.overall}) must beat clashing luxury (${sc.overall}) by a wide margin`);
  // nitpick guard: uniform-strong sets never hear "the rest can't keep up"
  for (const brand of ['Rick Owens', 'Maison Margiela', 'AMIRI', 'OUR LEGACY']) {
    const items = catalog.map((g, sl) => { const xs = g.filter(it => it.brand === brand && s2tier(it) >= 2); return xs.length ? xs[0] : g.find(it => it.brand === brand); });
    if (!items.every(Boolean)) continue;
    const rev = outfitReview(items, scoreV2(items)).join('\n');
    assert(!rev.includes('ついてきてない'), 'WS4: weak-link nitpick leaked for uniform-strong ' + brand + ': ' + rev);
  }
}

console.log(`test-v14: ${pass} passed, ${fail} failed`);
if (failures.length) { console.log(failures.slice(0, 20).join('\n')); process.exit(1); }
