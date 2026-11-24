// Player-facing TEXT test: comments (score2) + コーデ総評 (extras.outfitReview)
// must be witty commentary with NO internal axis names / axis numbers, must
// reference concrete outfit facts, must keep the plain-outfit guard, must not
// repeat between consecutive random outfits, and must not use wrong-tier
// framing (consistency with the reasons structure).
// Run after regenerating tests-out.json:  node build/test-text.js
const fs = require('fs'), vm = require('vm');
const { mulberry32 } = require('./load.js'); // populates catalog, scoreV2, s2attr globals
const R = process.env.HOME + '/workspace/closet-roll/';
const W = R + 'work/';
// --- stubs to load extras.js (same pattern as sample-review.js) ---
global.document = { createElement: () => ({ style: {}, dataset: {}, children: [], append() {}, replaceChildren() {}, addEventListener() {} }), addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
global.window = { addEventListener() {}, dispatchEvent() {} };
global.byId = () => ({ textContent: '', children: [], append() {}, replaceChildren() {}, addEventListener() {} });
global.CustomEvent = class {};
// load.js already declared labels/tiers/rank/names in this context; only fill gaps.
vm.runInThisContext(`
if(typeof yen==='undefined') globalThis.yen=v=>'¥'+v.toLocaleString('ja-JP');
if(typeof names==='undefined') globalThis.names={c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};
`);
vm.runInThisContext(fs.readFileSync(W + 'extras.js', 'utf8'), { filename: 'extras.js' });
const outfitReview = vm.runInThisContext('outfitReview');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }

const BANNED = ['ラグジュアリー性', '調和性', 'ファッション性', '日常適性', '色彩・柄の相性', '個性・華やかさ',
  '点数が伸び', '点が伸び', '押し上げ', '主因は', '内部評価'];
const BADWORDS = ['ダサい', 'センスがない', '事故物件', '意思疎通に失敗', '方向性が行方不明', '内紛', '衝突現場', '交通渋滞'];
const COLORWORDS = ['黒', '白', 'グレー', 'ブラウン', 'ベージュ', '赤', 'ピンク', 'オレンジ', '黄', '緑', '青', '紺', '紫', 'メタリック', 'マルチ', 'カーキ', 'モノトーン'];
const PHENOMENA = ['柄と柄', '柄使い', '季節感が真逆', 'ボリューム', '肌着', '室内履き', '買い物袋', '主役が多すぎ', '部屋着パンツ', '靴とバッグの色', '柄を繰り返す', '細身のライン', '素材感', '革靴まで', '街着の流れ', 'ニット同士'];
function shortName(name) {
  let n = String(name || '').split(' / ')[0].trim();
  if (n.length > 24) { let out = ''; for (const w of n.split(/\s+/)) { if ((out + ' ' + w).trim().length > 20) break; out = (out + ' ' + w).trim(); } n = out || n.slice(0, 20); }
  return n;
}
const PAIRS = ['トップス×ボトムス', 'ボトムス×シューズ', 'トップス×シューズ', 'トップス×小物'];
const tierOf = total => total <= 30000 ? 'cheap' : total <= 150000 ? 'mid' : total <= 500000 ? 'high' : 'lux';

function checkOutfit(items, s, tag) {
  const review = outfitReview(items, s);
  const comment = s.reasonComment;
  const allText = comment + '\n' + review.join('\n');
  // 1) no banned axis names / axis-claim phrases
  for (const w of BANNED) assert(!allText.includes(w), `${tag}: banned phrase "${w}" in text: ${allText}`);
  // 2) no axis numbers: strip prices and item brand/name strings, then no digits may remain
  let stripped = allText.replace(/¥[\d,]+/g, '');
  for (const it of items) { stripped = stripped.split(it.brand).join('').split(it.name).join('').split(shortName(it.name)).join(''); }
  assert(!/\d/.test(stripped), `${tag}: stray digit (axis number?) in text: ${allText}`);
  assert(!/(性|感|度|相性)は?\s*\d/.test(allText), `${tag}: metric readout pattern in text: ${allText}`);
  // 2b) no size/spec noise from raw product names ((R), (25-27cm), Ⓡ ...)
  assert(!/\(R\)|（R）|Ⓡ|\d+\s*[-〜~]\s*\d+\s*cm/.test(allText), `${tag}: size/spec noise in text: ${allText}`);
  // 3) comment references a concrete outfit fact
  const facts = ['¥' + s.total.toLocaleString('ja-JP'), ...items.map(x => x.brand), ...COLORWORDS, ...PAIRS, ...PHENOMENA];
  assert(facts.some(f => comment.includes(f)), `${tag}: comment has no concrete fact: ${comment}`);
  // 4) review shape (v14 WS2 length modes): STANDARD is 3 lines, SHORT
  // compresses to 1-2, LONG extends to 4; rage escalates to 4 (Lv2) or 5 (Lv3)
  assert(review.length >= 1 && review.length <= 6, `${tag}: review should be 1-6 lines, got ${review.length}: ${review.join(' / ')}`);
  // 5) plain outfits: no dasai-type wording anywhere player-facing
  if (s.cls === 'plain') {
    const all = s.title + s.impression + allText;
    for (const w of BADWORDS) assert(!all.includes(w), `${tag}: plain outfit got badword "${w}": ${all}`);
  }
  // 6) consistency of tier framing
  if (s.cls === 'plain' && (s.tier === 'high' || s.tier === 'lux'))
    assert(!/プチプラ|安さ|予算/.test(comment), `${tag}: expensive plain outfit framed as cheap: ${comment}`);
  if (s.cls === 'plain' && s.tier === 'cheap')
    assert(!/お金持ち|富裕/.test(comment + review.join('')), `${tag}: cheap plain outfit framed as rich: ${comment}`);
  return { comment, review };
}

// --- 15 SPEC test outfits (from tests-out.json, regenerated with new text) ---
const testsOut = JSON.parse(fs.readFileSync(R + 'build/tests-out.json', 'utf8'));
const findItem = (slot, text) => { const nm = text.split(': ')[1].replace(/ ¥[\d,]+$/, ''); return catalog[slot].find(it => (it.brand + ' ' + it.name) === nm); };
let md = '';
let checked = 0;
for (const rec of testsOut.patterns) {
  if (!rec.found) { md += `\n### ${rec.name}\n（構成できず）\n`; continue; }
  const items = rec.items.map((t, i) => findItem(i, t));
  assert(items.every(Boolean), `${rec.name}: item reconstruction failed`);
  if (!items.every(Boolean)) continue;
  const s = scoreV2(items);
  const { comment, review } = checkOutfit(items, s, rec.name);
  checked++;
  md += `\n### ${rec.name}（分類 ${s.cls}／総額 ¥${s.total.toLocaleString()}）\n- アイテム：${rec.items.join(' ／ ')}\n- 称号：${s.title}\n- 第一印象：${s.impression}\n- 得点下コメント：${comment}\n- コーデ総評：\n${review.map(l => '  - ' + l).join('\n')}\n`;
}
assert(checked >= 13, `expected at least 13 test outfits, checked ${checked}`);

// --- 30 random outfits: checks + consecutive-distinctness ---
const rng = mulberry32(777);
let prevComment = null, prevReview = null;
for (let k = 0; k < 30; k++) {
  const items = catalog.map(g => g[Math.floor(rng() * g.length)]);
  const s = scoreV2(items);
  const { comment, review } = checkOutfit(items, s, 'random#' + k);
  if (prevComment !== null) {
    assert(comment !== prevComment, `random#${k}: comment identical to previous outfit`);
    assert(review.join('\n') !== prevReview, `random#${k}: review identical to previous outfit`);
  }
  prevComment = comment; prevReview = review.join('\n');
}

fs.writeFileSync(R + 'build/text-samples.md', md);
console.log(`test-text: ${pass} passed, ${fail} failed`);
for (const f of failures.slice(0, 20)) console.log('FAIL:', f);
process.exit(fail ? 1 : 0);
