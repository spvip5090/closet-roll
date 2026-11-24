// Integration smoke test: extras.js consumers against scoreV2 output + new stats.js.
const fs = require('fs'), vm = require('vm');
global.localStorage = { getItem: () => null, setItem: () => {} };
global.matchMedia = () => ({ matches: true });
global.window = { addEventListener: () => {}, dispatchEvent: () => {} };
global.document = { createElement: () => ({ style: { setProperty: () => {} }, classList: { add: () => {}, toggle: () => {} }, setAttribute: () => {}, append: () => {} }), querySelectorAll: () => [], body: { append: () => {} } };
const R = process.env.HOME + '/workspace/closet-roll/';
const run = f => vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
run(R + 'original/cards.js');
run(R + 'work/attrs.js');
run(R + 'work/score2.js');
run(R + 'work/stats.js');
vm.runInThisContext(`const byId = id => ({ textContent:'', hidden:false, classList:{toggle:()=>{}}, querySelector:()=>({textContent:''}), querySelectorAll:()=>[], replaceChildren:()=>{}, append:()=>{}, dataset:{}, children:[], style:{} });`);
run(R + 'work/extras.js');
vm.runInThisContext(`resultMode = 'MIX';`);
const items = [catalog[0][0], catalog[1][10], catalog[2][10], catalog[3][10], catalog[4][10]];
const s = scoreV2(items);
console.log('score:', s.overall, s.cls, '| price(luxury)=', s.price, 'balance(harmony)=', s.balance, '| bonuses shape ok:', Array.isArray(s.bonuses));
console.log('titleFor ->', titleFor(items, s));
console.log('specials ->', JSON.stringify(specials(items, s)));
console.log('rarityText ->', rarityText(s, specials(items, s)));
console.log('coverLine ->', coverLine(items, s));
console.log('estimates modes:', Object.keys(estimates), 'MIX hist sum:', estimates.MIX.hist.reduce((a, b) => a + b, 0));
// game.js patched regions present?
const g = fs.readFileSync(R + 'work/game.js', 'utf8');
for (const needle of ['function scoreLookV1', 'scoreV2(items).reasonComment', 'score.headline', 'score.impression', 'score.clsLabel'])
  console.log('game.js contains', JSON.stringify(needle), ':', g.includes(needle));
const h = fs.readFileSync(R + 'work/index.html', 'utf8');
console.log('index.html loads attrs+score2:', h.includes('attrs.js') && h.includes('score2.js'), '| labels:', h.includes('豪華さ') && h.includes('調和'));
console.log('SMOKE OK');
