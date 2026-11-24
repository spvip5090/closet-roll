// Print one sample コーデ総評 for documentation. Run: node build/sample-review.js
const fs = require('fs'), vm = require('vm');
const R = process.env.HOME + '/workspace/closet-roll/work/';
global.document = { createElement: () => ({ style: {}, dataset: {}, children: [], append() {}, replaceChildren() {}, addEventListener() {} }), addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
global.window = { addEventListener() {}, dispatchEvent() {} };
global.byId = () => ({ textContent: '', children: [], append() {}, replaceChildren() {}, addEventListener() {} });
global.CustomEvent = class {};
const run = f => vm.runInThisContext(fs.readFileSync(R + f, 'utf8'), { filename: f });
run('cards.js'); run('attrs.js'); run('score2.js');
vm.runInThisContext(`
const labels=['トップス','ボトムス','シューズ','バッグ','小物'];
const tiers=['N','R','SR','SSR'];
const yen=v=>'¥'+v.toLocaleString('ja-JP');
const names={c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};
function rank(item){const legacy=/^photos\\/([0-3])-([0-3])\\.webp$/.exec(item.img||'');if(legacy)return Number(legacy[2]);return item.price<=4000?0:item.price>=150000?3:item.price>=70000?2:1;}
`);
run('extras.js');
const catalog = vm.runInThisContext('catalog');
const items = catalog.map(g => g.filter(x => x.street.role === 'everyday').sort((a, b) => a.price - b.price)[0]);
const s = scoreV2(items);
console.log('ITEMS:', items.map((x, i) => labels[i] + ': ' + x.brand + ' ' + x.name + ' ' + yen(x.price)).join(' ／ '));
console.log('OVERALL:', s.overall, 'CLS:', s.cls, '(' + s.clsLabel + ')');
console.log('得点下コメント:', s.reasonComment);
console.log('コーデ総評:');
for (const p of outfitReview(items, s)) console.log(' -', p);
