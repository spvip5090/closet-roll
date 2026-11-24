// Shared loader: loads catalog/attrs/score2 + original v1 engine + draw logic
// into the global lexical scope (like browser <script> tags), for Node harnesses.
const fs = require('fs'), vm = require('vm');
const R = process.env.HOME + '/workspace/closet-roll/';
const run = f => vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const runCode = c => vm.runInThisContext(c);
run(R + 'original/cards.js');
run(R + 'work/attrs.js');
run(R + 'work/score2.js');

const orig = fs.readFileSync(R + 'original/game.js', 'utf8');
const slice = (a, b) => orig.slice(orig.indexOf(a), orig.indexOf(b));
// v1 scoring (renamed to avoid clash with work/game.js names; standalone here)
runCode(slice("const cheap", "function randomEntry"));       // cheap, rich
runCode(slice("function outfitFit", "function scoreLook"));   // outfitFit
const v1score = orig.slice(orig.indexOf("function scoreLook"), orig.indexOf("function lookComment"))
  .replace("function scoreLook", "function scoreV1");
vm.runInThisContext("const names={c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};\n" + v1score);
// draw logic (needs labels/tiers/rank)
vm.runInThisContext("const labels=['トップス','ボトムス','シューズ','バッグ','小物']; const tiers=['N','R','SR','SSR'];");
runCode(slice("function rank", "const targetRates"));
runCode(slice("const targetRates", "function selected"));
function mulberry32(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function drawItems(mode, rng){ const code = drawLook(mode, rng); const ids = code.slice(1).split('.').map(Number); return ids.map((id,i)=>catalog[i][id]); }
module.exports = { mulberry32, drawItems };
