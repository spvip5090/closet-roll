// Random simulation: 100,000 MIX draws, v1 vs v2 on identical outfits.
// Also regenerates work/stats.js with v2 (100k per mode) so the in-game
// "実測推定" display matches the shipped engine.
const fs = require('fs');
const { mulberry32, drawItems } = require('./load.js');
const R = process.env.HOME + '/workspace/closet-roll/';
const N = 100000;
function stats(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const dec = q => sorted[Math.min(arr.length - 1, Math.floor(q * arr.length))];
  return { mean: +mean.toFixed(1), p10: dec(.1), p25: dec(.25), p50: dec(.5), p75: dec(.75), p90: dec(.9),
    ge90: +(100 * arr.filter(v => v >= 90).length / arr.length).toFixed(2),
    le10: +(100 * arr.filter(v => v <= 10).length / arr.length).toFixed(2) };
}
function corr(xs, ys) {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return +(num / Math.sqrt(dx * dy)).toFixed(3);
}
function specials(items, s) {
  const total = items.reduce((n, x) => n + x.price, 0), list = [];
  if (items.every(x => x.brand === items[0].brand)) list.push('COMPLETE BRAND');
  const tones = items.map(x => ({ BLK: '黒', BLACK: '黒', WHT: '白', WHITE: '白', NVY: '紺', NAVY: '紺' })[x.name.split(' / ').at(-1).trim().toUpperCase()]);
  if (tones[0] && tones.every(t => t === tones[0])) list.push('MONOCHROME');
  if (total >= 1000000) list.push('MILLION STYLE');
  if (total <= 10000 && s.overall >= 80) list.push('BUDGET MASTER');
  if (s.overall <= 10) list.push('FASHION DISASTER');
  if (total >= 500000 && s.overall <= 30) list.push('MONEY IS NOT STYLE');
  if (s.overall === 100) list.push('PERFECT STYLE');
  return list;
}
// --- main comparison on MIX ---
const rng = mulberry32(987654321);
const v1 = [], v2 = [], totals = [], clsCount = {};
const hist2 = Array(101).fill(0);
for (let i = 0; i < N; i++) {
  const items = drawItems('MEN', rng);
  const s1 = scoreV1(items), s2 = scoreV2(items);
  v1.push(s1.overall); v2.push(s2.overall); totals.push(s2.total);
  hist2[s2.overall]++; clsCount[s2.cls] = (clsCount[s2.cls] || 0) + 1;
}
const S1 = stats(v1), S2 = stats(v2);
const corrV1 = corr(totals, v1), corrV2 = corr(totals, v2);
// determinism check
const detItems = drawItems('MEN', mulberry32(1));
const det = scoreV2(detItems).overall === scoreV2(detItems).overall &&
  JSON.stringify(scoreV2(detItems).axes) === JSON.stringify(scoreV2(detItems).axes);
let md = '## ランダムシミュレーション（MIX 100,000回、同一コーデで v1/v2 比較）\n\n';
md += '| 指標 | v1（旧） | v2（新） |\n|---|---|---|\n';
md += `| 平均 | ${S1.mean} | ${S2.mean} |\n| 中央値 | ${S1.p50} | ${S2.p50} |\n| p10–p90 | ${S1.p10}–${S1.p90} | ${S2.p10}–${S2.p90} |\n`;
md += `| 90点以上 | ${S1.ge90}% | ${S2.ge90}% |\n| 10点以下 | ${S1.le10}% | ${S2.le10}% |\n`;
md += `| 総額との相関 | ${corrV1} | ${corrV2} |\n\n`;
md += `v2 分類の内訳：${Object.entries(clsCount).map(([k, v]) => k + ' ' + (100 * v / N).toFixed(1) + '%').join('、')}\n\n`;
md += `決定性チェック（同じ5点を2回採点して完全一致）：${det ? 'OK' : 'NG'}\n\n`;
md += 'v2 得点ヒストグラム（10点刻み）：' + Array.from({ length: 10 }, (_, b) => `${b * 10}-${b * 10 + 9}: ${(100 * hist2.slice(b * 10, b * 10 + 10).reduce((a, x) => a + x, 0) / N).toFixed(1)}%`).join('、') + `、100: ${(100 * hist2[100] / N).toFixed(2)}%\n`;
fs.writeFileSync(R + 'build/sim-frag.md', md);
console.log(md);
// --- regenerate stats.js with v2 for all modes ---
const estimates = {};
for (const mode of ['MEN', 'WOMEN']) {
  const r = mulberry32(13579);
  const hist = Array(101).fill(0), special = {};
  for (let i = 0; i < N; i++) {
    const items = drawItems(mode, r);
    const s = scoreV2(items);
    hist[s.overall]++;
    for (const k of specials(items, s)) special[k] = (special[k] || 0) + 1;
  }
  estimates[mode] = { n: N, hist, special };
  console.log(mode, 'stats regenerated');
}
fs.writeFileSync(R + 'work/stats.js', 'const estimates=' + JSON.stringify(estimates) + ';\n');
console.log('work/stats.js written');
