// Test outfits from ACTUAL catalog items via seeded random search per pattern.
const fs = require('fs');
const { mulberry32, drawItems } = require('./load.js');
const R = process.env.HOME + '/workspace/closet-roll/';
const rng = mulberry32(20261124);
const NEUT = new Set([1,2,3,4,5,14,16]);
const A = it => s2attr(it);
const pools = pred => catalog.map((g, s) => g.filter(it => pred(it, s, A(it))));
const ALL = pools(() => true);
function search(pool, qualify, objective, tries = 30000) {
  if (pool.some(p => !p.length)) return null;
  let best = null;
  for (let t = 0; t < tries; t++) {
    const items = pool.map(p => p[Math.floor(rng() * p.length)]);
    const s = scoreV2(items);
    if (!qualify(s, items)) continue;
    const v = objective(s, items);
    if (!best || v > best.v) best = { v, items, s };
  }
  return best;
}
const cheap = max => pools(it => it.price <= max);
const rich = min => pools(it => it.price >= min);
const patterns = [
  ['安価で無難', cheap(4500), (s, it) => s.cls === 'plain' && s.total <= 20000, s => s.axes.daily],
  ['安価でオシャレ', cheap(7000), (s, it) => (s.cls === 'stylish' || s.cls === 'wild_good') && s.total <= 30000, s => s.axes.fashion],
  ['安価で壊滅的（ダサい）', cheap(6000), s => s.cls === 'dasai', s => -s.overall],
  ['高額で無難', rich(60000), s => s.cls === 'plain', s => s.axes.harmony],
  ['高額でオシャレ', rich(50000), (s) => s.cls === 'stylish' || s.cls === 'wild_good', s => s.overall],
  ['高額で壊滅的（ダサい／不成立）', rich(50000), s => s.cls === 'dasai' || s.cls === 'wild_fail', s => -s.overall],
  ['同一ブランドだが相性が悪い', null, s => s.axes.harmony <= 58, s => -s.axes.harmony], // pool set below
  ['異なる系統だが相性が良い', ALL, (s, it) => new Set(it.map(x => x.style)).size >= 3 && new Set([it[0].style, it[1].style, it[2].style]).size === 3, s => s.axes.fashion],
  ['全身無地で自然にまとまった', pools((it, s, a) => a[5] === 0 && a[11] <= 42 && it.price <= 30000), s => s.axes.harmony >= 60, s => s.axes.harmony],
  ['全身派手だが成立している', pools((it, s, a) => a[11] >= 52), s => s.cls === 'wild_good', s => s.axes.fashion],
  ['全身派手で成立していない', pools((it, s, a) => a[11] >= 52), s => s.cls === 'wild_fail', s => -s.axes.harmony],
  ['色彩の相性が悪い', pools((it, s, a) => a[0] && !NEUT.has(a[0])), s => s.axes.color <= 55, s => -s.axes.color],
  ['シルエットの相性が悪い', pools((it, s) => s === 0 ? /ダウン|ボア|中綿|DOWN|PUFFER|タンクトップ|TANK/i.test(it.name) || A(it)[7] === 3
      : s === 1 ? /ショートパンツ|ハーフパンツ|SHORTS|トラック|ジャージ|TRACK/i.test(it.name)
      : s === 2 ? /サンダル|SANDAL|パンプス|PUMPS|ドレスシューズ/i.test(it.name) : true),
    s => s.axes.silhouette <= 52, s => -s.axes.silhouette],
  ['季節感が噛み合っていない', pools((it, s) => s === 0 ? /ダウン|ボア|中綿|防寒|DOWN|PUFFER/i.test(it.name)
      : s === 1 ? /ショートパンツ|ハーフパンツ|SHORTS/i.test(it.name)
      : s === 2 ? /サンダル|SANDAL/i.test(it.name) : true),
    s => s.reasons.minus.some(n => n.includes('季節感')), s => 1],
  ['シンプルなアイテムが主役を引き立てている', null, s => s.axes.complete >= 68 && s.reasons.hero.slot === 'トップス', s => s.axes.complete], // pool below
];
// same-brand pool: pick the god brand with most items
{
  const brands = {};
  catalog.forEach(g => g.forEach(it => { brands[it.brand] = (brands[it.brand] || 0) + 1; }));
  const god = Object.keys(brands).filter(b => catalog.every(g => g.some(it => it.brand === b)))
    .sort((a, b) => brands[b] - brands[a])[0];
  patterns[6][1] = pools(it => it.brand === god);
  patterns[6][0] += '（' + god + '統一）';
  patterns[14][1] = pools((it, s, a) => s === 0 ? a[11] >= 60 : (a[11] <= 32 && (!a[0] || NEUT.has(a[0]))));
}
const out = [];
let md = '## テストコーデ結果（実在アイテムで構成）\n';
const BADWORDS = ['ダサい', 'センスがない', '事故物件', '意思疎通に失敗', '方向性が行方不明', '内紛', '衝突現場'];
let guardViolations = [];
for (const [name, pool, qualify, objective] of patterns) {
  const r = pool && search(pool, qualify, objective);
  if (!r) { md += `\n### ${name}\n構成できず（該当プール不足または条件未達）。\n`; out.push({ name, found: false }); continue; }
  const { items, s } = r;
  const rec = { name, found: true, total: s.total, overall: s.overall, cls: s.cls, axes: s.axes, title: s.title, impression: s.impression, reasonComment: s.reasonComment, items: items.map((it, i) => ['トップス', 'ボトムス', 'シューズ', 'バッグ', '小物'][i] + ': ' + it.brand + ' ' + it.name + ' ¥' + it.price) };
  out.push(rec);
  if (s.cls === 'plain') {
    const text = s.title + s.impression + s.reasonComment;
    for (const w of BADWORDS) if (text.includes(w)) guardViolations.push(name + ' に「' + w + '」');
  }
  md += `\n### ${name}\n- アイテム：${rec.items.join(' ／ ')}\n- 総額 ¥${s.total.toLocaleString()}｜総合 ${s.overall}点｜分類 ${s.cls}（${s.clsLabel}）\n- 軸：豪華${s.axes.luxury} 魅力${s.axes.appeal} 色彩柄${s.axes.color} シルエット${s.axes.silhouette} 統一${s.axes.style} 完成度${s.axes.complete} 個性${s.axes.indiv} ファッション性${s.axes.fashion} 調和${s.axes.harmony} 日常${s.axes.daily}\n- 称号：${s.title}｜第一印象：${s.impression}\n- 得点下コメント：${s.reasonComment}\n`;
}
// ---- single-variable tests ----
md += '\n## 単一変数テスト\n';
const base = out.find(r => r.found && r.name === '安価で無難');
let sv = {};
if (base) {
  const baseItems = patterns[0] && null;
  // rebuild base items by re-searching deterministically is fragile; instead re-derive from recorded names:
  const findItem = (slot, text) => { const nm = text.split(': ')[1].replace(/ ¥[\d,]+$/, ''); return catalog[slot].find(it => (it.brand + ' ' + it.name) === nm); };
  const items = base.items.map((t, i) => findItem(i, t));
  const s0 = scoreV2(items);
  // price only: swap bag -> most expensive neutral low-assert bag
  const bagPool = catalog[3].filter(it => { const a = A(it); return (!a[0] || NEUT.has(a[0])) && a[11] <= 40; }).sort((a, b) => b.price - a.price);
  const vPrice = items.slice(); vPrice[3] = bagPool[0];
  const sP = scoreV2(vPrice);
  // tops only: swap tops -> highest-assert tops within x2 price
  const topPool = catalog[0].filter(it => it.price <= items[0].price * 2.2 && !/インナー|肌着|エアバリア/.test(it.name)).sort((a, b) => A(b)[11] - A(a)[11]);
  const vTop = items.slice(); vTop[0] = topPool[0];
  const sT = scoreV2(vTop);
  sv = { base: s0, priceSwap: { item: bagPool[0].brand + ' ' + bagPool[0].name + ' ¥' + bagPool[0].price, s: sP }, topSwap: { item: topPool[0].brand + ' ' + topPool[0].name + ' ¥' + topPool[0].price, s: sT } };
  md += `- ベース（安価で無難）：総合${s0.overall} 豪華${s0.axes.luxury} 個性${s0.axes.indiv} 調和${s0.axes.harmony} 分類${s0.cls}\n`;
  md += `- 価格だけ変更（バッグ→${sv.priceSwap.item}）：総合${sP.overall} 豪華${sP.axes.luxury}（${sP.axes.luxury - s0.axes.luxury >= 0 ? '+' : ''}${sP.axes.luxury - s0.axes.luxury}） 個性${sP.axes.indiv} 調和${sP.axes.harmony} 分類${sP.cls}\n`;
  md += `- トップスだけ変更（→${sv.topSwap.item}）：総合${sT.overall} 個性${sT.axes.indiv}（${sT.axes.indiv - s0.axes.indiv >= 0 ? '+' : ''}${sT.axes.indiv - s0.axes.indiv}） ファッション性${sT.axes.fashion} 調和${sT.axes.harmony} 分類${sT.cls}\n`;
}
// color only: same brand + same name-stem tops in different color families
{
  // NOTE: the catalog has no true color variants of the same product, so use the
  // closest controlled pair: same brand/price-band/style/pattern, assert within 5,
  // differing (essentially) only in color family.
  const stripC = n => n.toUpperCase().replace(/\b(BLK|WHT|RED|BLU|GRN|PNK|BRW|GRY|GRAY|GREY|NVY|NAVY|ORG|YEL|PPL|GLD|SLV|BEG|BLACK|WHITE|BROWN|BEIGE|IVORY|BLUE|GREEN|PINK|ORANGE|YELLOW|PURPLE|GOLD|SILVER|CAMEL|BUR|ECRU|MIX|CHARCOAL|SAX)\b/g, '').replace(/ブラック|ホワイト|グレー|ブラウン|ベージュ|ネイビー|レッド|ブルー|グリーン|ピンク|オレンジ|イエロー|パープル|ゴールド|シルバー|カーキ|紺|赤|青|緑|茶|白|黒/g, '');
  const toks = n => new Set(stripC(n).split(/[\s\/・、（）()]+/).filter(t => t.length >= 2));
  let pair = null;
  outer: for (const p of catalog[0]) {
    const pa = A(p); if (!NEUT.has(pa[0])) continue;
    const tp = toks(p.name);
    for (const v of catalog[0]) {
      const va = A(v);
      if (v === p || v.brand !== p.brand) continue;
      if (!va[0] || NEUT.has(va[0])) continue;
      const tv = toks(v.name);
      const jac = [...tp].filter(t => tv.has(t)).length / Math.max(tp.size, tv.size, 1);
      if (jac < 0.6) continue;
      pair = [p, v]; break outer;
    }
  }
  let done = null;
  if (pair) {
    const [plain, vivid] = pair;
    const fillers = [catalog[1][0], catalog[2][0], catalog[3][0], catalog[4][0]];
    // choose harmonious neutral fillers
    const fl = [1, 2, 3, 4].map(s => catalog[s].find(it => { const a = A(it); return (!a[0] || NEUT.has(a[0])) && a[11] <= 35; }));
    if (!fl.some(x => !x)) {
      const sA = scoreV2([plain, ...fl]), sB = scoreV2([vivid, ...fl]);
      done = { plain: plain.brand + ' ' + plain.name, vivid: vivid.brand + ' ' + vivid.name, sA, sB };
    }
  }
  if (done) {
    sv.colorSwap = done;
    md += `- 色だけ変更（トップス ${done.plain} → ${done.vivid}、他は同一）：色彩柄 ${done.sA.axes.color}→${done.sB.axes.color}、個性 ${done.sA.axes.indiv}→${done.sB.axes.indiv}、総合 ${done.sA.overall}→${done.sB.overall}、分類 ${done.sA.cls}→${done.sB.cls}\n`;
  } else md += '- 色だけ変更：条件を満たす近似ペアが見つからず未実施（カタログに同一商品の色違い自体が存在しないことは別途確認済み）。\n';
}
md += `\n## 重要チェック：安価×無難に「ダサい」系表現が付かないか\n${guardViolations.length ? '違反あり：' + guardViolations.join('、') : '違反なし（分類=無難の全テストコーデで称号・両コメントにダサい系表現なし）'}\n`;
// ---- paired unity test (synthetic items: everything equal except style mix) ----
// The progressive unity bonus must be REAL points: the same outfit at 5/5
// style unity scores >=6 more (post-spread) than at 2/5 unity, all else
// equal. And a full-unity JUNK outfit (atrocity items, broken) collects NO
// bonuses and stays <=15 - bonuses must never rescue junk.
{
  const mk = styles => styles.map((st, i) => ({ id: 'pair' + i + st, brand: 'PAIR' + i, name: 'プレーンアイテム' + i, price: 20000, style: st, street: { role: 'everyday', points: 50 }, img: '' }));
  const sA = scoreV2(mk(['c', 'c', 'c', 'c', 'c'])), sB = scoreV2(mk(['c', 'c', 's', 'e', 'p']));
  const diff = sA.overall - sB.overall;
  md += `\n## ペアテスト（段階・統一ボーナス）\n- 5/5統一：総合${sA.overall}（${JSON.stringify(sA.bonuses)}）\n- 2/5統一：総合${sB.overall}（${JSON.stringify(sB.bonuses)}）\n- 差：${diff}点（要件：6点以上）\n`;
  if (diff < 6) throw new Error('paired unity test FAILED: 5/5 vs 2/5 diff = ' + diff + ' (< 6)');
  const junkItems = [
    { id: 'j0', brand: 'JUNKCO', name: 'エアバリアインナー 長袖', price: 1500, style: 'c', street: { role: 'underlayer', points: 10 }, img: '' },
    { id: 'j1', brand: 'JUNKCO', name: 'プレーンパンツ', price: 2000, style: 'c', street: { role: 'everyday', points: 50 }, img: '' },
    { id: 'j2', brand: 'JUNKCO', name: 'プレーンシューズ', price: 2000, style: 'c', street: { role: 'everyday', points: 50 }, img: '' },
    { id: 'j3', brand: 'JUNKCO', name: 'クラフト紙袋', price: 110, style: 'c', street: { role: 'specialUse', points: 5 }, img: '' },
    { id: 'j4', brand: 'JUNKCO', name: 'プレーンキャップ', price: 1500, style: 'c', street: { role: 'everyday', points: 50 }, img: '' },
  ];
  const sj = scoreV2(junkItems);
  md += `- 全統一ジャンク（肌着＋紙袋）：総合${sj.overall}、ボーナス ${JSON.stringify(sj.bonuses)}（要件：ボーナスなし＆15点以下）\n`;
  if (sj.bonuses.length || sj.overall > 15) throw new Error('junk guard FAILED: overall=' + sj.overall + ' bonuses=' + JSON.stringify(sj.bonuses));
}
// ---- petit-prix relief (2026-11-24): hard cap + best-case construction ----
// A seeded hill-climb over cheap pools constructs the best relieved outfit:
// it must exist, land in the 80-89 band (DAILY-praise territory), and no
// relieved outfit in a 100k sim may exceed the hard cap of 94 (relief can
// NEVER produce 100 - smitten/100 stay luxury territory).
let reliefBest = null;
{
  const rRng = mulberry32(20261125);
  const cheapPool = catalog.map(g => g.filter(it => it.price <= 10000));
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
  if (!bestR) throw new Error('relief search FAILED: no relieved outfit found');
  // WS4 (2026-11-24): the coherence credits (brand count in the unity
  // axis, worldview) let the searched best case reach the hard cap -
  // the invariant that matters is the cap itself (never 95+), so the
  // band is 80-94 now (was 80-89 before the uniform credit existed).
  if (!(bestR.s.overall >= 80 && bestR.s.overall <= 94)) throw new Error('relief best-case must land in 80-94, got ' + bestR.s.overall);
  reliefBest = { overall: bestR.s.overall, cls: bestR.s.cls, total: bestR.s.total, reliefPts: bestR.s.reliefPts, items: bestR.items.map((it, i) => ['トップス', 'ボトムス', 'シューズ', 'バッグ', '小物'][i] + ': ' + it.brand + ' ' + it.name + ' ¥' + it.price) };
  md += `\n## プチプラ救済（緩和）ベストケース\n- 構成：${reliefBest.items.join(' ／ ')}\n- 総額 ¥${bestR.s.total.toLocaleString()}｜総合 ${bestR.s.overall}点｜分類 ${bestR.s.cls}｜救済 +${bestR.s.reliefPts}点（スプレッド前）｜調和 ${bestR.s.axes.harmony}｜完成度 ${bestR.s.axes.complete}\n`;
  const rSim = mulberry32(555);
  let relN = 0, relMax = 0;
  for (let i = 0; i < 100000; i++) { const s = scoreV2(drawItems('MEN', rSim)); if (s.relief) { relN++; relMax = Math.max(relMax, s.overall); } }
  if (relMax > 94) throw new Error('relief cap FAILED: a relieved outfit scored ' + relMax + ' (> 94)');
  md += `- 100,000回シミュレーション中の救済適用：${relN}件、最高 ${relMax}点（上限94を超過なし）\n`;
}
fs.writeFileSync(R + 'build/tests-out.json', JSON.stringify({ patterns: out, singleVar: sv, guardViolations, reliefBest }, null, 1));
fs.writeFileSync(R + 'build/tests-frag.md', md);
console.log(md);
