// WS4 calibration panel (v14, 2026-11-24): ~20 hand-picked realistic
// outfits spanning ordinary fashion judgment, scored by the engine in
// SCORE2 (env, default work/score2.js). Run twice - once against the
// pre-WS4 engine (git show HEAD:work/score2.js) and once against the
// tuned one - and compare the ordering against fashion intuition:
//   coherent designer uniform > coherent high-street > random luxury
//   mix > clashing junk.
// Item selection depends only on the catalog, never on the engine, so
// the panel is identical across runs.
// Run: SCORE2=/tmp/score2-v13.js node build/panel-v14.js
const fs = require('fs'), vm = require('vm');
const R = process.env.HOME + '/workspace/closet-roll/';
const run = f => vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
run(R + 'original/cards.js');
run(R + 'work/attrs.js');
run(process.env.SCORE2 || (R + 'work/score2.js'));
const catalog = vm.runInThisContext('catalog');
const scoreV2 = vm.runInThisContext('scoreV2');
const s2attr = vm.runInThisContext('s2attr');
const s2tier = vm.runInThisContext('s2tier');

const A = it => s2attr(it);
const NEUT = new Set([0, 1, 2, 3, 4, 5, 14, 16]);
const byAppeal = (a, b) => (A(b)[12] - A(a)[12]) || (b.price - a.price);
function pick(slot, pred, sort = byAppeal) {
  const xs = catalog[slot].filter(pred);
  if (!xs.length) return null;
  return xs.slice().sort(sort)[0];
}
const uniform = (brand, sort) => catalog.map((g, s) => pick(s, it => it.brand === brand, sort));
const maxPrice = (a, b) => b.price - a.price;

const testsOut = JSON.parse(fs.readFileSync(R + 'build/tests-out.json', 'utf8'));
const findItem = (slot, text) => { const nm = text.split(': ')[1].replace(/ ¥[\d,]+$/, ''); return catalog[slot].find(it => (it.brand + ' ' + it.name) === nm); };
const patternItems = name => { const rec = testsOut.patterns.find(r => r.name === name && r.found); return rec ? rec.items.map((t, i) => findItem(i, t)) : null; };

const PANEL = [];
const add = (name, expect, items) => PANEL.push({ name, expect, items });

// 1. the user's 88-point case: all Rick Owens, 4xSSR + 1xSR, all mode
add('rick-uniform', '95+', ['LARRY FOGPOCKET SHIRT', 'MASTODON CARGO', 'MEGA BUMPER GEOBASKET', 'GEMINI BAG', 'GIGLIO MEGA']
  .map((nm, s) => catalog[s].find(x => x.name.includes(nm))));
// 2. all-Margiela designer uniform (max price per slot)
add('margiela-uniform', '90+', uniform('Maison Margiela', maxPrice));
// 3. all-AMIRI luxury-street uniform
add('amiri-uniform', '85+', uniform('AMIRI', maxPrice));
// 4. all-OUR LEGACY designer uniform
add('ourlegacy-uniform', '85+', uniform('OUR LEGACY'));
// 5. mode mixed-brand coherent: all style e, all different brands, neutral palette, expensive
{
  const used = new Set(); const items = [];
  for (let s = 0; s < 5; s++) { const it = pick(s, x => x.style === 'e' && !used.has(x.brand) && NEUT.has(A(x)[0]) && x.price >= 30000); used.add(it.brand); items.push(it); }
  add('mode-mixed-coherent', '85+', items);
}
// 6. god mix: all SSR, different brands, style matched to the top's style
{
  const top = pick(0, x => s2tier(x) === 3); const used = new Set([top.brand]); const items = [top];
  for (let s = 1; s < 5; s++) { const it = pick(s, x => s2tier(x) === 3 && !used.has(x.brand) && x.style === top.style) || pick(s, x => s2tier(x) === 3 && !used.has(x.brand)); used.add(it.brand); items.push(it); }
  add('god-mix-ssr', '95+', items);
}
// 7. quiet luxury mix: expensive, neutral, mixed brands
{
  const used = new Set(); const items = [];
  for (let s = 0; s < 5; s++) { const it = pick(s, x => x.price >= 60000 && NEUT.has(A(x)[0]) && A(x)[11] <= 40 && A(x)[5] === 0 && (!x.street || x.street.role !== 'statement') && !used.has(x.brand)); used.add(it.brand); items.push(it); }
  add('quiet-luxury-mix', '90+', items);
}
// 8. street coherent: all style s, mixed brands
{
  const used = new Set(); const items = [];
  for (let s = 0; s < 5; s++) { const it = pick(s, x => x.style === 's' && !used.has(x.brand)); used.add(it.brand); items.push(it); }
  add('street-coherent', '78+', items);
}
// 9. high-street done well: all style c, mid price, neutral, mixed brands
{
  const used = new Set(); const items = [];
  for (let s = 0; s < 5; s++) { const it = pick(s, x => x.style === 'c' && x.price >= 4000 && x.price <= 40000 && NEUT.has(A(x)[0]) && !used.has(x.brand)); used.add(it.brand); items.push(it); }
  add('highstreet-good', '78-95', items);
}
// 10. denim work casual: denim top+bottom, casual rest
{
  const items = [
    pick(0, x => /デニム|DENIM/i.test(x.name) && x.price <= 60000),
    pick(1, x => /デニム|ジーンズ|JEANS/i.test(x.name) && x.price <= 60000),
    pick(2, x => x.style === 'c' && x.price <= 60000),
    pick(3, x => x.style === 'c' && x.price <= 60000),
    pick(4, x => x.style === 'c' && x.price <= 60000),
  ];
  add('denim-casual', '75-90', items);
}
// 11. GU full uniform (cheap but coherent)
add('gu-uniform', '55-80', catalog.map((g, s) => pick(s, x => x.brand === 'GU' && NEUT.has(A(x)[0])) || pick(s, x => x.brand === 'GU')));
// 12. WEGO street uniform (cheap)
add('wego-uniform', '50-75', uniform('WEGO'));
// 13. CONVERSE casual uniform (cheap)
add('converse-uniform', '58-75', uniform('CONVERSE'));
// 14. cheap chic: the fixed relief best-case construction recorded in
// tests-out.json (¥27,199, scored 87 under the v13 engine)
add('cheap-chic', '80-94', testsOut.reliefBest ? testsOut.reliefBest.items.map((t, i) => findItem(i, t)) : null);
// 15. cheap plain pattern (tests-out, was ~11pts)
add('cheap-plain', '5-30', patternItems('安価で無難'));
// 16. luxury clash: duelling statement pieces (severe style clash) +
// strong patterns and strong colors on top - money cannot buy this out
{
  const byAssert = (a, b) => A(b)[11] - A(a)[11] || b.price - a.price;
  const items = [
    pick(0, x => x.street && x.street.role === 'statement' && x.style === 'e' && x.price >= 50000, byAssert),
    pick(1, x => x.street && x.street.role === 'statement' && x.style === 'p' && x.price >= 50000, byAssert),
    pick(2, x => A(x)[5] >= 2, maxPrice) || pick(2, x => x.style === 's', maxPrice),
    pick(3, x => A(x)[0] && !NEUT.has(A(x)[0]) && x.price >= 30000, maxPrice),
    pick(4, x => A(x)[5] >= 2, maxPrice),
  ];
  add('luxury-clash', '<55', items);
}
// 17. pattern clash: 3+ strong patterns
{
  const items = [];
  for (let s = 0; s < 5; s++) items.push(s < 3 ? pick(s, x => A(x)[5] >= 2, maxPrice) : pick(s, x => true, maxPrice));
  add('pattern-clash', '<50', items);
}
// 18. junk mix: inner/underwear/indoor/paper-bag/eco-bag by name
add('junk-mix', '<=15', [
  pick(0, x => /インナー|肌着|エアバリア/.test(x.name), (a, b) => a.price - b.price),
  pick(1, x => /スパッツ|インナー|LONG JOHNS|アンダーパンツ/.test(x.name), (a, b) => a.price - b.price),
  pick(2, x => /上履き|室内/.test(x.name), (a, b) => a.price - b.price),
  pick(3, x => /ポリ袋|紙袋/.test(x.name), (a, b) => a.price - b.price),
  pick(4, x => /エコバッグ/.test(x.name), (a, b) => a.price - b.price) || pick(4, x => x.street && (x.street.role === 'utility' || x.street.role === 'specialUse'), (a, b) => a.price - b.price) || pick(4, () => true, (a, b) => a.price - b.price),
]);
// 19. smitten 97 regression outfit (user's real pull)
add('smitten-97', '97', [
  catalog[0].find(x => /WAR OF THE SEA SILK SHIRT/.test(x.name)),
  catalog[1].find(x => /3 LAYERED TRACK PANTS/.test(x.name)),
  catalog[2].find(x => /NAHMIAS CROCHET/.test(x.name)),
  catalog[3].find(x => x.brand === 'UNIQLO' && /ドローストリングバッグ/.test(x.name)),
  catalog[4].find(x => /mononoke/.test(x.brand) && /WALLET CHAIN/.test(x.name)),
]);
// 20. max-100 pattern (tests-out)
add('max-100', '100', patternItems('高額でオシャレ'));
// 21. black world: all black, mode/street, mixed brands, mid-high price
{
  const used = new Set(); const items = [];
  for (let s = 0; s < 5; s++) { const it = pick(s, x => A(x)[0] === 1 && (x.style === 'e' || x.style === 's') && x.price >= 15000 && !used.has(x.brand)); used.add(it.brand); items.push(it); }
  add('black-world-mix', '78+', items);
}
// 22. THE ATTICO uniform (one per slot)
add('attico-uniform', '70-95', uniform('THE ATTICO'));

// 23. price ladder: SAME coherence class (single style world, neutral
// palette, mixed brands) at three price tiers - within a coherence
// class, price/rarity must order the score (user direction 2026-11-24).
{
  const ladder = (lo, hi) => { const used = new Set(); const items = [];
    for (let s = 0; s < 5; s++) { const it = pick(s, x => x.style === 'e' && NEUT.has(A(x)[0]) && x.price >= lo && x.price <= hi && !used.has(x.brand)) || pick(s, x => NEUT.has(A(x)[0]) && x.price >= lo && x.price <= hi && !used.has(x.brand)); used.add(it.brand); items.push(it); }
    return items; };
  add('ladder-high', 'top', ladder(80000, Infinity));
  add('ladder-mid', 'mid', ladder(12000, 60000));
  add('ladder-low', 'low', ladder(0, 12000));
}

console.log('| # | panel | expect | total | overall | cls | lux | app | col | sil | uni | com | ind | bonus |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
PANEL.forEach((p, i) => {
  if (!p.items || p.items.some(x => !x)) { console.log(`| ${i + 1} | ${p.name} | ${p.expect} | CONSTRUCTION FAILED |`); return; }
  const s = scoreV2(p.items);
  const bonus = s.bonuses.reduce((n, b) => n + b[1], 0);
  console.log(`| ${i + 1} | ${p.name} | ${p.expect} | ¥${s.total.toLocaleString()} | ${s.overall} | ${s.cls} | ${s.axes.luxury} | ${s.axes.appeal} | ${s.axes.color} | ${s.axes.silhouette} | ${s.axes.style} | ${s.axes.complete} | ${s.axes.indiv} | +${bonus} |`);
  console.log(`| | | | ${p.items.map(x => x.brand + ' ' + x.name + ' ¥' + x.price).join(' ／ ')} |`);
});
