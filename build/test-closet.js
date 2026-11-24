// Closet flavour test (v13, 2026-11-24): My Closet judging speaks in
// Mirei's CONSULTATION voice （相談室） while the gacha keeps the stage
// voice. Scores/tiers/banners/FX are shared; only the review text differs:
//   - opening = consultation framing (she knows he assembled it himself
//     and brought it to her): 自分で / 組ん / 見せに来た / 相談 markers
//   - a coaching note (gacha reviews never have one) derived from the
//     score internals: clash kind -> worst pair -> weakest non-luxury
//     axis / weakest piece; 95+ gets the nothing-to-fix note （本番で着て）
//   - rage keeps its structure + reason-first rant; only the opening
//     scolds the DELIBERATE choice
//   - relief keeps DAILY framing (closet wins the opening, DAILY the love)
//   - closet flutter/smitten closings OCCASIONALLY nod at the real stage
// Pronoun gradient (user decision 2026-11-24 21:19): あんた is the
// professional default everywhere below 90 and in all non-affection
// contexts; キミ leaks only at 90+ - flutter a few slips, smitten about
// half the address lines, MAX predominant, daily flutter an occasional
// slip, daily praise never. No confession in either pronoun.
// The gacha path must be byte-identical to v12: outfitReview(items, s)
// === outfitReview(items, s, 'gacha'), and reviewSource defaults 'gacha'.
// Run: node build/test-closet.js (after build/tests.js regenerated tests-out.json)
const fs = require('fs'), vm = require('vm');
const { mulberry32 } = require('./load.js'); // catalog, scoreV2, s2attr globals
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
const outfitReview = vm.runInThisContext('outfitReview');
const personaTier = vm.runInThisContext('personaTier');
const personaOffense = vm.runInThisContext('personaOffense');
const personaKindsOf = vm.runInThisContext('personaKindsOf');
const grab = n => vm.runInThisContext(n);

let pass = 0, fail = 0; const failures = [];
function assert(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }

const BANNED = ['ラグジュアリー性', '調和性', 'ファッション性', '日常適性', '色彩・柄の相性', '個性・華やかさ', '点数が伸び', '押し上げ', '主因は', '内部評価'];
const MARKER = /自分で|組ん|見せに来た|相談|持ってきた|わざわざ/;
const CONFESS = [/あんたが好き/, /あんたを好き/, /あんたに惚れ/, /キミが好き/, /キミを好き/, /キミに惚れ/, /好きになっちゃった/, /大好き/, /あんたへの気持ち/, /キミへの気持ち/, /好きよ、あんた/, /好きよ、キミ/];
const SUPERIOR = /なさい|合格|任命|審査|保証する|責任/;
const COACH_HEAD = /^(あとは|直すなら|直す場所、探した|アドバイス|何も直さなくていい|直すところ、ない)/;

// --- reconstruct the SPEC pattern outfits (same as test-persona) ---
const testsOut = JSON.parse(fs.readFileSync(R + 'build/tests-out.json', 'utf8'));
const findItem = (slot, text) => { const nm = text.split(': ')[1].replace(/ ¥[\d,]+$/, ''); return catalog[slot].find(it => (it.brand + ' ' + it.name) === nm); };
const patterns = {};
for (const rec of testsOut.patterns) {
  if (!rec.found) continue;
  const items = rec.items.map((t, i) => findItem(i, t));
  if (items.every(Boolean)) patterns[rec.name] = items;
}
const swap = (base, slot, item) => base.map((x, i) => i === slot ? item : x);
function checkCommon(items, s, review, tag) {
  const all = review.join('\n');
  for (const w of BANNED) assert(!all.includes(w), `${tag}: banned "${w}": ${all}`);
  let stripped = all.replace(/¥[\d,]+/g, '');
  for (const it of items) stripped = stripped.split(it.brand).join('').split(it.name).join('');
  assert(!/\d/.test(stripped), `${tag}: stray digit in review: ${all}`);
  return all;
}

// --- pool-level: consultation markers in every closet opening pool ---
for (const name of ['CLOSET_OPEN_LOW', 'CLOSET_OPEN_MID', 'CLOSET_OPEN_HIGH', 'CLOSET_OPEN_BORED', 'CLOSET_OPEN_FLUTTER', 'CLOSET_OPEN_SMITTEN', 'CLOSET_OPEN_MAX', 'CLOSET_OPEN_DAILY_PRAISE', 'CLOSET_OPEN_DAILY_FLUTTER', 'CLOSET_RAGE_OPEN_MILD', 'CLOSET_RAGE_OPEN_HOT']) {
  const pool = grab(name);
  assert(Array.isArray(pool) && pool.length >= 3, `${name}: pool should have >=3 lines`);
  const marked = pool.filter(l => MARKER.test(l)).length;
  assert(marked >= Math.ceil(pool.length * 0.75), `${name}: only ${marked}/${pool.length} lines carry a consultation marker`);
}

// --- pronoun gradient: pool scans ---
const NO_KIMI_POOLS = ['PRAISE_OPEN', 'PRAISE_CLOSE', 'APPROVE_OPEN', 'APPROVE_CLOSE', 'BORED_OPEN', 'BORED_OPEN_RICH', 'BORED_CLOSE', 'EXASP_OPEN', 'EXASP_CLOSE', 'SCOLD_OPEN', 'SCOLD_CLOSE', 'RAGE1_OPEN', 'RAGE1_CLOSE', 'RAGE1_CLOSE_PLAIN', 'RAGE2_OPEN', 'RAGE2_EXTRA', 'RAGE2_CLOSE', 'RAGE3_OPEN', 'RAGE3_MID', 'RAGE3_EXTRA', 'RAGE3_CLOSE', 'DAILY_PRAISE_OPEN', 'DAILY_PRAISE_POINT', 'DAILY_PRAISE_CLOSE', 'CLOSET_OPEN_LOW', 'CLOSET_OPEN_MID', 'CLOSET_OPEN_HIGH', 'CLOSET_OPEN_BORED', 'CLOSET_OPEN_DAILY_PRAISE', 'CLOSET_RAGE_OPEN_MILD', 'CLOSET_RAGE_OPEN_HOT'];
for (const name of NO_KIMI_POOLS) for (const line of grab(name)) assert(!line.includes('キミ'), `pronoun: ${name} must stay あんた below 90: ${line}`);
{
  const BP = grab('BAND_POOLS');
  for (const b of [1, 2, 3, 4, 5]) for (const f of ['std', 'sharp']) for (const slot of ['open', 'push', 'close'])
    for (const line of BP[b][f][slot]) assert(!line.includes('キミ'), `pronoun: BAND_POOLS band${b}/${f}/${slot} must stay あんた: ${line}`);
  const BB = grab('BORED_BAND');
  for (const b of [1, 2, 3, 4, 5]) for (const slot of ['open', 'close'])
    for (const line of BB[b][slot]) assert(!line.includes('キミ'), `pronoun: BORED_BAND band${b}/${slot} must stay あんた: ${line}`);
  for (const src of ['PERSONA_MINUS_V', 'PERSONA_PLUS_V', 'CLOSET_COACH_KIND'])
    for (const k of Object.keys(grab(src))) for (const line of grab(src)[k]) assert(!line.includes('キミ'), `pronoun: ${src}.${k} must stay あんた: ${line}`);
  const kimiLines = pool => pool.filter(l => l.includes('キミ')).length;
  const fl = [...grab('FLUTTER_OPEN'), ...grab('FLUTTER_CLOSE')];
  assert(kimiLines(fl) >= 1 && kimiLines(fl) <= 4, `pronoun: flutter pools should carry a few キミ slips (1-4), got ${kimiLines(fl)}`);
  const sm = [...grab('SMITTEN_OPEN'), ...grab('SMITTEN_CLOSE')];
  assert(kimiLines(sm) >= 5, `pronoun: smitten pools should mix キミ substantially, got ${kimiLines(sm)} lines`);
  const mx = [...grab('SMITTEN_MAX_OPEN'), ...grab('SMITTEN_MAX_CLOSE')];
  const mxAnta = mx.filter(l => l.includes('あんた')).length;
  assert(kimiLines(mx) >= 5 && kimiLines(mx) > mxAnta, `pronoun: MAX pools should be キミ-predominant (キミ ${kimiLines(mx)} vs あんた ${mxAnta})`);
  const df = [...grab('DAILY_FLUTTER_OPEN'), ...grab('DAILY_FLUTTER_POINT'), ...grab('DAILY_FLUTTER_CLOSE')];
  assert(kimiLines(df) >= 1 && kimiLines(df) <= 2, `pronoun: daily flutter may carry an occasional slip (1-2), got ${kimiLines(df)}`);
  assert(kimiLines(grab('CLOSET_OPEN_FLUTTER')) >= 1, 'pronoun: closet flutter openings should include a slip');
  assert(kimiLines(grab('CLOSET_OPEN_SMITTEN')) >= 2, 'pronoun: closet smitten openings should mix キミ');
  assert(kimiLines(grab('CLOSET_OPEN_MAX')) >= 2, 'pronoun: closet MAX openings should be キミ-led');
  assert(kimiLines(grab('CLOSET_COACH_NONE')) >= 1 && kimiLines(grab('CLOSET_COACH_NONE_MAX')) >= 1, 'pronoun: nothing-to-fix notes follow the tier gradient');
}

// --- gacha path byte-identity + default source ---
assert(grab('reviewSource') === 'gacha', 'source: reviewSource defaults to gacha');
for (const [name, items] of Object.entries(patterns)) {
  const s = scoreV2(items);
  const a = outfitReview(items, s), b = outfitReview(items, s, 'gacha');
  assert(a.join('\n') === b.join('\n'), `identity: ${name} default mode must equal explicit gacha mode`);
  const c = outfitReview(items, s, 'closet');
  const tier = personaTier(s, personaOffense(items, s));
  checkCommon(items, s, c, 'closet ' + name);
  assert(c.join('\n') !== a.join('\n'), `flavour: ${name} closet review must differ from the gacha review`);
  if (tier === 'rage') {
    assert(c.length === a.length, `flavour: ${name} closet rage keeps the gacha line count (${c.length} vs ${a.length})`);
    assert(c[1] === a[1], `flavour: ${name} closet rage keeps the reason-first rant line`);
    assert(grab('CLOSET_RAGE_OPEN_MILD').includes(c[0]) || grab('CLOSET_RAGE_OPEN_HOT').includes(c[0]), `flavour: ${name} closet rage opening must come from the closet rage pools: ${c[0]}`);
  } else {
    // WS2: a SHORT one-liner gacha base (1 line) becomes a 3-line closet
    // review (consultation opening + coaching + the verdict line).
    assert(c.length === a.length + 1 || (a.length === 1 && c.length === 3), `flavour: ${name} closet review adds exactly the coaching line (${c.length} vs ${a.length})`);
    assert(MARKER.test(c[0]) || grab('CLOSET_OPEN_HIGH').includes(c[0]), `flavour: ${name} closet opening must carry the consultation framing: ${c[0]}`);
    assert(COACH_HEAD.test(c[c.length - 2]), `flavour: ${name} coaching note missing before the closing: ${c[c.length - 2]}`);
    assert(c[c.length - 1] === a[a.length - 1] || grab('CLOSET_STAGE_CLOSE').includes(c[c.length - 1]), `flavour: ${name} closet closing should stay the tier closing (or a stage nod)`);
  }
  if (s.overall < 90) assert(!c.join('').includes('キミ'), `pronoun: ${name} closet review below 90 must not leak キミ: ${c.join(' / ')}`);
}

// --- coaching derivation: a lopsided pattern-clash outfit is coached on
// the pattern clash itself (the engine's own weakest element) ---
{
  const rng = mulberry32(31337);
  let clash = null;
  for (let k = 0; k < 40000 && !clash; k++) {
    const items = catalog.map(g => g[Math.floor(rng() * g.length)]);
    const s = scoreV2(items);
    if (s.overall < 95 && !personaOffense(items, s) && personaKindsOf(s.reasons.minus).includes('pattern')) clash = { items, s };
  }
  assert(!!clash, 'coach: no pattern-clash outfit found to construct');
  if (clash) {
    const c = outfitReview(clash.items, clash.s, 'closet');
    const coach = c[c.length - 2];
    assert(COACH_HEAD.test(coach) && coach.includes('柄'), 'coach: pattern-clash outfit must be coached on the pattern placement: ' + coach);
  }
  // and a random sample: the inserted line is always a coaching note
  const rng2 = mulberry32(777);
  let sampled = 0;
  for (let k = 0; k < 300 && sampled < 40; k++) {
    const items = catalog.map(g => g[Math.floor(rng2() * g.length)]);
    const s = scoreV2(items);
    if (personaOffense(items, s)) continue;
    const c = outfitReview(items, s, 'closet');
    assert(COACH_HEAD.test(c[c.length - 2]), 'coach: sampled closet review lacks a coaching note: ' + c.join(' / '));
    sampled++;
  }
  assert(sampled === 40, 'coach: sampling failed (' + sampled + ')');
}

// --- rage in closet: deliberate-choice scolding, reason still first ---
{
  const bag = catalog[3].find(x => x.brand === 'UNIQLO' && /エコバッグ/.test(x.name));
  const items = swap(patterns['安価で無難'], 3, bag);
  const s = scoreV2(items);
  assert(personaTier(s, personaOffense(items, s)) === 'rage', 'closet rage: setup should be rage tier');
  const c = outfitReview(items, s, 'closet');
  assert(grab('CLOSET_RAGE_OPEN_MILD').includes(c[0]), 'closet rage: opening must scold the deliberate choice: ' + c[0]);
  assert(c[1].includes('エコバッグ'), 'closet rage: first content line still names the item: ' + c[1]);
  assert(!c.join('').includes('キミ'), 'closet rage: rage is a non-affection context, no キミ: ' + c.join(' / '));
}

// --- relief in closet: DAILY love, closet opening, cap respected ---
{
  const rb = testsOut.reliefBest;
  const items = rb.items.map((t, i) => findItem(i, t));
  assert(items.every(Boolean), 'closet daily: reliefBest reconstruction failed');
  const s = scoreV2(items);
  assert(s.relief === true && s.overall <= 94, 'closet daily: relief setup (relief=' + s.relief + ', ' + s.overall + 'pts)');
  // WS4: the relief best case now lands at the 94 cap (flutter tier);
  // the daily-PRAISE closet key is checked on an 87-point clone.
  const c = outfitReview(items, Object.assign({}, s, { overall: 87 }), 'closet');
  assert(grab('CLOSET_OPEN_DAILY_PRAISE').includes(c[0]), 'closet daily: opening must come from CLOSET_OPEN_DAILY_PRAISE: ' + c[0]);
  assert(/普段着|毎日|日常/.test(c.join('')), 'closet daily: everyday marker missing: ' + c.join(' / '));
  for (const line of c) if (line.includes('ランウェイ')) assert(/じゃない|ではない/.test(line), 'closet daily: ランウェイ only negated: ' + line);
  assert(!c.join('').includes('キミ'), 'closet daily: daily praise (85-89) never leaks キミ: ' + c.join(' / '));
}

// --- 95+ in closet: smitten / MAX rules hold, nothing-to-fix note ---
{
  const items97 = [
    catalog[0].find(x => /WAR OF THE SEA SILK SHIRT/.test(x.name)),
    catalog[1].find(x => /3 LAYERED TRACK PANTS/.test(x.name)),
    catalog[2].find(x => /NAHMIAS CROCHET/.test(x.name)),
    catalog[3].find(x => x.brand === 'UNIQLO' && /ドローストリングバッグ/.test(x.name)),
    catalog[4].find(x => /mononoke/.test(x.brand) && /WALLET CHAIN/.test(x.name)),
  ];
  const s97 = scoreV2(items97);
  assert(s97.overall === 97 && personaTier(s97, null) === 'smitten', 'closet smitten: 97pt setup');
  const c97 = outfitReview(items97, s97, 'closet');
  assert(grab('CLOSET_OPEN_SMITTEN').includes(c97[0]), 'closet smitten: opening from CLOSET_OPEN_SMITTEN: ' + c97[0]);
  assert(grab('CLOSET_COACH_NONE').includes(c97[c97.length - 2]), 'closet smitten: coaching slot must be the nothing-to-fix note: ' + c97[c97.length - 2]);
  assert(c97[c97.length - 2].includes('本番'), 'closet smitten: nothing-to-fix note points at the real stage');
  for (const line of c97) assert(!SUPERIOR.test(line), 'closet smitten: superior marker leaked: ' + line);
  for (const re of CONFESS) assert(!re.test(c97.join('')), `closet smitten: confession ${re}: ${c97.join(' / ')}`);
  const items100 = patterns['高額でオシャレ'];
  const s100 = scoreV2(items100);
  assert(s100.overall === 100, 'closet MAX: 100pt setup, got ' + s100.overall);
  const c100 = outfitReview(items100, s100, 'closet');
  assert(grab('CLOSET_OPEN_MAX').includes(c100[0]), 'closet MAX: opening from CLOSET_OPEN_MAX: ' + c100[0]);
  assert(grab('CLOSET_COACH_NONE_MAX').includes(c100[c100.length - 2]), 'closet MAX: coaching slot must be the MAX nothing-to-fix note: ' + c100[c100.length - 2]);
  for (const re of CONFESS) assert(!re.test(c100.join('')), `closet MAX: confession ${re}: ${c100.join(' / ')}`);
}

// --- stage nod: occasional in closet flutter/smitten, never in gacha ---
{
  const sampleTier = (target, n, seed) => {
    const rng = mulberry32(seed);
    const rich = catalog.map(g => { const r = g.filter(x => x.price >= 30000); return r.length ? r : g; });
    const out = []; let guard = 0;
    while (out.length < n && guard++ < 60000) {
      const items = rich.map(g => g[Math.floor(rng() * g.length)]);
      const s = scoreV2(items);
      if (personaTier(s, personaOffense(items, s)) === target) out.push({ items, s });
    }
    return out;
  };
  const STAGE = grab('CLOSET_STAGE_CLOSE');
  for (const target of ['flutter', 'smitten']) {
    const drawn = sampleTier(target, 40, 2026);
    assert(drawn.length === 40, `stage nod: ${target} sampling failed (${drawn.length})`);
    const closetRevs = drawn.map(({ items, s }) => outfitReview(items, s, 'closet'));
    const nods = closetRevs.filter(r => STAGE.includes(r[r.length - 1])).length;
    assert(nods >= 1 && nods <= 20, `stage nod: closet ${target} should nod occasionally (1-20 of 40), got ${nods}`);
    const gachaRevs = drawn.map(({ items, s }) => outfitReview(items, s));
    assert(gachaRevs.every(r => !STAGE.includes(r[r.length - 1])), `stage nod: gacha ${target} must never use the closet stage nod`);
  }
}

console.log(`test-closet: ${pass} passed, ${fail} failed`);
for (const f of failures.slice(0, 25)) console.log('FAIL:', f);
process.exit(fail ? 1 : 0);
