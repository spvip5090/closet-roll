// Hidden special-pack test: sequential forced rolls (super -> god -> brand)
// inside drawLook, item-based outcome determination in verdict, records
// counters, and a secrecy audit (the conditions/odds must never appear in
// player-facing strings). Run: node build/test-pack.js
const fs = require('fs'), vm = require('vm');
const R = process.env.HOME + '/workspace/closet-roll/';
const W = R + 'work/';
const run = f => vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
run(W + 'cards.js'); // catalog (identical to original/cards.js)
vm.runInThisContext(`
const labels=['トップス','ボトムス','シューズ','バッグ','小物'];
const tiers=['N','R','SR','SSR'];
let current='';
`);
const gsrc = fs.readFileSync(W + 'game.js', 'utf8');
const slice = (a, b) => gsrc.slice(gsrc.indexOf(a), gsrc.indexOf(b));
vm.runInThisContext(slice('const cheap', 'function selected'), { filename: 'game.js#draw' });
vm.runInThisContext(slice('function verdict', 'function outfitFit'), { filename: 'game.js#verdict' });
const catalog = vm.runInThisContext('catalog');
const rank = vm.runInThisContext('rank');
const eligible = vm.runInThisContext('eligible');
const modePlan = vm.runInThisContext('modePlan');
const drawLook = vm.runInThisContext('drawLook');
const verdict = vm.runInThisContext('verdict');
function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let pass = 0, fail = 0; const failures = [];
function assert(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }
const itemsOf = code => code.slice(1).split('.').map((v, i) => catalog[i][+v]);
const sameBrand = items => items.every(x => x.brand === items[0].brand);
const allSSR = items => items.every(x => rank(x) === 3);

// --- feasibility: eligible brands per mode / mechanic (independent count) ---
for (const mode of ['MEN', 'WOMEN']) {
  const groups = catalog.map(g => g.map((x, i) => i).filter(i => eligible(g[i], mode)));
  const allBrands = [...new Set(catalog.flat().map(x => x.brand))];
  const brandOk = allBrands.filter(b => groups.every((ids, s) => ids.some(i => catalog[s][i].brand === b)));
  const superOk = allBrands.filter(b => groups.every((ids, s) => ids.some(i => catalog[s][i].brand === b && rank(catalog[s][i]) === 3)));
  const plan = modePlan(mode);
  assert(plan.brands.length === brandOk.length, `${mode}: plan brands ${plan.brands.length} != independent ${brandOk.length}`);
  assert(plan.superBrands.length === superOk.length, `${mode}: plan superBrands ${plan.superBrands.length} != independent ${superOk.length}`);
  assert(plan.brands.length > 0, `${mode}: brand pack must be feasible`);
  // current catalog: no brand has an SSR item in every slot of either mode,
  // so super hits must degrade to god packs (do not fake a super pool).
  assert(plan.superBrands.length === 0, `${mode}: super-eligible brands expected 0 in current catalog, got ${plan.superBrands.length} (${plan.superBrands.join(',')})`);
  assert(plan.pSuper === .0001 && plan.pGod === .001 && plan.pBrand === .01, `${mode}: special rates wired (${plan.pSuper}/${plan.pGod}/${plan.pBrand})`);
  console.log(`  [info] ${mode}: brand-eligible=${brandOk.length} (${brandOk.join(', ')}), super-eligible=${superOk.length}`);
}

// --- forced-special rates over 200k seeded draws per mode ---
for (const [mode, seed] of [['MEN', 1357911], ['WOMEN', 24681012]]) {
  const rng = mulberry32(seed), N = 200000;
  let g = 0, god = 0, brand = 0, sup = 0, bad = 0;
  for (let k = 0; k < N; k++) {
    const code = drawLook(mode, rng);
    if (code[0] !== 'g') continue;
    g++;
    const items = itemsOf(code), sb = sameBrand(items), ss = allSSR(items);
    if (ss && sb) sup++; else if (ss) god++; else if (sb) brand++; else bad++;
    const theme = verdict(items)[0];
    if (!((ss && sb && theme === 'supergod') || (ss && !sb && theme === 'god') || (!ss && sb && theme === 'brand'))) bad++;
  }
  console.log(`  [info] ${mode}: forced=${g} (${(100 * g / N).toFixed(2)}%), god-class=${god}, brand-class=${brand}, super-class=${sup}`);
  assert(bad === 0, `${mode}: ${bad} forced draws violate their pattern / verdict mapping`);
  assert(g >= 2000 && g <= 2450, `${mode}: forced-special total ${g}/${N} outside ~1.11% band`);
  // super (0.01%) degrades to god, so god-class ~= (0.0001+0.001)*N = 220
  assert(god >= 140 && god <= 310, `${mode}: god-class forced ${god}/${N} outside ~0.11% band`);
  assert(brand >= 1750 && brand <= 2250, `${mode}: brand-class forced ${brand}/${N} outside ~1% band`);
  assert(sup <= 5, `${mode}: super-class forced ${sup} should be ~0 while no super brand exists`);
}

// --- outcome determination is from items (naturals included), any prefix ---
{
  const rng = mulberry32(777);
  let checked = 0, mismatch = 0;
  for (let k = 0; k < 20000; k++) {
    const items = itemsOf(drawLook(k % 2 ? 'WOMEN' : 'MEN', rng));
    const theme = verdict(items)[0], sb = sameBrand(items), ss = allSSR(items);
    if ((theme === 'supergod') !== (ss && sb)) mismatch++;
    if ((theme === 'god') !== (ss && !sb)) mismatch++;
    if ((theme === 'brand') !== (!ss && sb)) mismatch++;
    checked++;
  }
  assert(mismatch === 0, `natural determination: ${mismatch} mismatches in ${checked} draws`);
}

// --- outcome mapping + precedence on constructed item sets ---
{
  const mk = (brand, tier, price) => ({ brand, name: 'TEST ITEM', price, img: 'photos/0-' + tier + '.webp', style: 'c', gender: 'unisex', street: { role: 'everyday', points: 68 } });
  const supSet = Array.from({ length: 5 }, () => mk('TESTBRAND', 3, 200000)); // also all-rich (jackpot-shaped)
  assert(verdict(supSet)[0] === 'supergod', 'mapping: all-SSR + same brand -> supergod, got ' + verdict(supSet)[0]);
  assert(verdict(supSet)[1] === 'SUPER GOD PACK', 'mapping: supergod kicker');
  const godSet = ['A', 'B', 'C', 'D', 'E'].map(b => mk(b, 3, 200000));
  assert(verdict(godSet)[0] === 'god' && verdict(godSet)[1] === 'GOD PACK', 'mapping: all-SSR mixed brands -> god');
  const brandSet = Array.from({ length: 5 }, () => mk('TESTBRAND', 1, 10000));
  assert(verdict(brandSet)[0] === 'brand' && verdict(brandSet)[1] === 'BRAND PACK', 'mapping: same brand mixed rarities -> brand');
  const normalSet = ['A', 'B', 'C', 'D', 'E'].map(b => mk(b, 1, 12000));
  assert(verdict(normalSet)[0] === 'mix', 'mapping: ordinary set -> mix, got ' + verdict(normalSet)[0]);
  // precedence: special > jackpot (all-rich) is covered by supSet/godSet above;
  // special > bust: an all-cheap single-brand set is a brand pack, not a bust.
  const cheapBrandSet = Array.from({ length: 5 }, () => mk('TESTBRAND', 0, 2000));
  assert(verdict(cheapBrandSet)[0] === 'brand', 'precedence: all-cheap same-brand -> brand (not bust), got ' + verdict(cheapBrandSet)[0]);
}

// --- pack copy mystique (user, 2026-11-24 20:10): god/supergod banner copy
// celebrates a legendary event and NEVER reveals the mechanism - no rarity
// words, no aggregate claims, no counts, no conditions. (The pre-existing
// single-item reveal hint 'SSR確定' is ordinary gacha language, not an
// aggregate claim, and is out of scope here.) ---
{
  const mk = (brand, tier, price) => ({ brand, name: 'TEST ITEM', price, img: 'photos/0-' + tier + '.webp', style: 'c', gender: 'unisex', street: { role: 'everyday', points: 68 } });
  const FORBIDDEN = ['SSR', 'レア', '全部', '全て', 'すべて', '5枚', '五枚', '確定', '揃'];
  const supV = verdict(Array.from({ length: 5 }, () => mk('TESTBRAND', 3, 200000)));
  const godV = verdict(['A', 'B', 'C', 'D', 'E'].map(b => mk(b, 3, 200000)));
  for (const [tag, v] of [['supergod', supV], ['god', godV]]) {
    const copy = v[2] + ' ' + v[3];
    for (const w of FORBIDDEN) assert(!copy.includes(w), `pack copy: ${tag} banner leaks "${w}": ${copy}`);
  }
  // god-pack openings get no EXTRA aggregate hint beyond the standard
  // single-item reveal line: the SSR reveal hint stays the plain one.
  assert(gsrc.includes("'金の箔が浮かぶ。SSR確定。'"), 'pack copy: standard single-item SSR reveal hint must remain the plain one');
}

// --- records counters exist and mirror the god pattern ---
{
  const esrc = fs.readFileSync(W + 'extras.js', 'utf8');
  assert(esrc.includes('supergod:0') && esrc.includes('brandpack:0'), 'records: state defaults carry supergod/brandpack counters');
  assert(esrc.includes("pack==='supergod'") && esrc.includes("pack==='brand'"), 'records: counting is verdict-based');
  assert(esrc.includes("'SUPER GOD'") && esrc.includes("'BRAND'"), 'records: stats grid shows SUPER GOD / BRAND counts');
  assert(!esrc.includes("current[0]==='g'"), 'records: old prefix-based god counting removed');
}

// --- secrecy audit: conditions / odds never appear in player-facing text ---
{
  const deny = ['五枚すべてが同じブランド', '同じブランドへ', '揃うと', '揃えたら', 'そろうと', '確率', '出現率', '排出率', 'ブランド統一パック', 'スーパーゴッド', '0.01%', '0.1%', 'ハズレ', '全SSR', '全部SSR', '5枚すべて', '全てSSR', 'レア確定'];
  const literals = src => {
    const out = [], re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    let m; while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3]);
    return out.join('\n');
  };
  const targets = {
    'index.html': fs.readFileSync(W + 'index.html', 'utf8'),
    'game.js literals': literals(gsrc),
    'extras.js literals': literals(fs.readFileSync(W + 'extras.js', 'utf8')),
    'score2.js literals': literals(fs.readFileSync(W + 'score2.js', 'utf8')),
  };
  for (const [name, text] of Object.entries(targets))
    for (const w of deny) assert(!text.includes(w), `secrecy: "${w}" found in ${name}`);
  assert(!gsrc.includes('五枚すべてが同じブランドへ'), 'secrecy: old explanatory SSR hint still in game.js');
}

// --- draw freshness (2026-11-24): recency suppression x0.15 (last 10
// pulls) + un-found boost x1.3, within-tier only. With a stubbed player
// state whose recent window is full of the PONT DES ARTS BELT outfit, the
// belt's share among SSR accessories must drop hard; forced specials must
// still fire (they bypass suppression) and every draw stays valid. ---
{
  const beltIdx = catalog[4].findIndex(x => /PONT DES ARTS BELT/.test(x.name));
  assert(beltIdx >= 0, 'freshness: PONT DES ARTS BELT exists in the accessory slot');
  const ssrAcc = new Set(catalog[4].map((x, i) => rank(x) === 3 ? i : -1).filter(i => i >= 0));
  const beltCode = 'n0.0.0.0.' + beltIdx;
  const countBelt = (seed, n) => {
    const rng = mulberry32(seed);
    let ssr = 0, belt = 0;
    for (let k = 0; k < n; k++) {
      const ids = drawLook('MEN', rng).slice(1).split('.').map(Number);
      if (ssrAcc.has(ids[4])) { ssr++; if (ids[4] === beltIdx) belt++; }
    }
    return { ssr, belt, share: ssr ? belt / ssr : 0 };
  };
  delete globalThis.state;
  const before = countBelt(112233, 30000);
  globalThis.state = { recent: Array.from({ length: 10 }, () => ({ code: beltCode, mode: 'MEN', title: '', score: 0 })), found: {} };
  const after = countBelt(112233, 30000);
  console.log(`  [info] freshness: belt share of SSR accessories before=${(100 * before.share).toFixed(1)}% (${before.belt}/${before.ssr}) after=${(100 * after.share).toFixed(1)}% (${after.belt}/${after.ssr})`);
  assert(after.share < before.share * 0.6, `freshness: suppressed belt share ${after.share.toFixed(3)} should be < 60% of baseline ${before.share.toFixed(3)}`);
  // forced specials still fire with a full recent window (bypass), draws valid
  const rngF = mulberry32(445566);
  let g = 0, valid = 0;
  for (let k = 0; k < 30000; k++) {
    const code = drawLook('MEN', rngF);
    if (code[0] === 'g') g++;
    const ids = code.slice(1).split('.').map(Number);
    if (ids.length === 5 && ids.every((v, i) => catalog[i][v])) valid++;
  }
  assert(valid === 30000, 'freshness: all draws stay valid with suppression active (' + valid + '/30000)');
  assert(g >= 220 && g <= 460, `freshness: forced specials with state present ${g}/30000 outside ~1.11% band`);
  delete globalThis.state;
}

console.log(`test-pack: ${pass} passed, ${fail} failed`);
for (const f of failures.slice(0, 25)) console.log('FAIL:', f);
process.exit(fail ? 1 : 0);
