// Affiliate / purchase-link structure test (shops.js + extras.js detail slot).
// Uses a minimal DOM stub like test-ui.js; run: node build/test-aff.js
// Fixture vendor entries are injected into SHOP_DATA at test time only -
// the shipped shops.js data stays empty.
const fs = require('fs'), vm = require('vm');
const R = process.env.HOME + '/workspace/closet-roll/work/';
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.hidden = false; this.open = false; this.value = ''; this._text = ''; this.listeners = {}; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  append(...k) { this.children.push(...k); }
  replaceChildren(...k) { this.children = k; }
  addEventListener(k, f) { this.listeners[k] = f; }
}
const els = {};
['detail','detailImg','detailTier','detailSlot','detailBrand','detailName','detailPrice','detailOwn','detailAttrs','detailShop','message','records','archive','recent','book','bookBox','bookFilter','bookSearch','bookCounts','bookMore','params','bonusChips','prDisclosure'].forEach(id => els[id] = new El('div'));
els.bookFilter.value = 'acquired'; els.bookSearch.value = '';
els.prDisclosure.hidden = true; // matches index.html (hidden attribute)
const events = [];
global.document = { createElement: t => new El(t), addEventListener() {}, getElementById: id => els[id] || null };
global.localStorage = { getItem: () => null, setItem() {} };
global.window = { addEventListener() {}, dispatchEvent(e) { events.push(e); } };
global.byId = id => els[id];
global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
const run = f => vm.runInThisContext(fs.readFileSync(R + f, 'utf8'), { filename: f });
run('cards.js'); run('shops.js'); run('attrs.js'); run('score2.js');
vm.runInThisContext(`
const labels=['トップス','ボトムス','シューズ','バッグ','小物'];
const tiers=['N','R','SR','SSR'];
const yen=v=>'¥'+v.toLocaleString('ja-JP');
const names={c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};
function rank(item){const legacy=/^photos\\/([0-3])-([0-3])\\.webp$/.exec(item.img||'');if(legacy)return Number(legacy[2]);return item.price<=4000?0:item.price>=150000?3:item.price>=70000?2:1;}
`);
run('extras.js');
const catalog = vm.runInThisContext('catalog');
const SHOP_DATA = vm.runInThisContext('SHOP_DATA');
const SHOP_CONFIG = vm.runInThisContext('SHOP_CONFIG');
const buildVendorLinks = vm.runInThisContext('buildVendorLinks');
const applyShopDisclosure = vm.runInThisContext('applyShopDisclosure');
const openDetail = vm.runInThisContext('openDetail');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) fails++; };
const shopRows = () => (els.detailShop.children[0] ? els.detailShop.children[0].children.filter(c => c.className === 'shopRow') : []);
const shopTexts = () => (els.detailShop.children[0] ? els.detailShop.children[0].children.map(c => c.textContent) : []);

// 0) Shipped data is empty + disclosure hidden while the flag is off
ok(Object.keys(SHOP_DATA).length === 0, 'shipped SHOP_DATA has no per-item entries');
ok(SHOP_CONFIG.affiliateEnabled === false, 'affiliate flag ships OFF');
ok(els.prDisclosure.hidden === true, 'PR disclosure stays hidden while flag is off');

// 1) Normal item: generated search links for every item
const item = catalog[0][0];
const links = buildVendorLinks(item);
ok(links.length === 3 && links.every(l => l.kind === 'search' && l.match === '検索リンク' && l.affiliate === false), 'normal item gets 3 search links, all labeled 検索リンク');
ok(links[0].href.startsWith('https://search.rakuten.co.jp/search/mall/') && links[0].href.includes(encodeURIComponent(item.brand)), 'rakuten search URL built from brand+name');
ok(links[1].href.startsWith('https://www.amazon.co.jp/s?k='), 'amazon search URL');
ok(links[2].href.startsWith('https://www.google.com/search?q='), 'web search URL');

// 2) Detail sheet renders the search links, plain rel, no PR marker
openDetail(item, 0);
ok(shopRows().length === 3, 'detail sheet shows 3 search rows');
ok(shopRows().every(r => r.children[0].rel === 'noopener'), 'search anchors use rel=noopener only');
ok(shopRows().every(r => !r.children[0].children.some(c => c.className === 'prMark')), 'no PR marker on plain search links');
ok(shopRows().every(r => r.children[0].children.some(c => c.className === 'matchTag' && c.textContent === '検索リンク')), 'each search anchor carries the 検索リンク tag');
ok(shopTexts().some(t => t.includes('検索結果ページ')), 'search caveat note is shown');

// 3) Clicking a search link fires closet:event vendor_click
events.length = 0;
shopRows()[0].children[0].onclick();
ok(events.length === 1 && events[0].type === 'closet:event', 'click dispatched one closet:event');
const d = events[0] && events[0].detail;
ok(d && d.name === 'vendor_click' && d.type === 'vendor_click' && d.itemId === item.id && d.vendor === '楽天市場' && d.matchType === '検索リンク', 'vendor_click detail: ' + JSON.stringify(d));

// 4) Fixture vendor entries (test-only injection), flag OFF -> plain URLs win
const item2 = catalog[1][0];
SHOP_DATA[item2.id] = [
  { vendor: 'テストストア', url: 'https://example.com/products/plain', affiliateUrl: null, asp: null, price: 12000, currency: 'JPY', stock: '販売中', condition: '新品', match: '同一商品', lastChecked: '2026-11-24', source: '手動確認' },
  { vendor: 'アフィリ商店', url: 'https://example.com/products/aff', affiliateUrl: 'https://example.com/aff/aff', asp: 'テストASP', price: 11500, currency: 'JPY', stock: '在庫切れ', condition: '中古', match: '同一商品', lastChecked: '2026-11-20', source: '手動確認' },
  { vendor: '切れリンク商店', url: 'https://example.com/products/dead', affiliateUrl: null, asp: null, price: null, currency: 'JPY', stock: 'リンク切れ', condition: '新品', match: '同一商品', lastChecked: '2026-11-01', source: '手動確認' }
];
const vOff = buildVendorLinks(item2);
ok(vOff.length === 2 && vOff.every(l => l.kind === 'shop'), 'リンク切れ entry is excluded, 2 shop entries remain');
ok(vOff[1].href === 'https://example.com/products/aff' && vOff[1].affiliate === false, 'flag OFF: plain URL is used even when affiliateUrl exists');
openDetail(item2, 1);
ok(shopRows().length === 2, 'detail sheet shows the 2 vendor entries instead of search links');
ok(shopRows().every(r => r.children[0].rel === 'noopener' && !r.children[0].children.some(c => c.className === 'prMark')), 'flag OFF: no sponsored rel / PR marker in detail sheet');
ok(shopRows()[0].children.some(c => c.className === 'shopMeta' && c.textContent.includes('販売価格 ¥12,000') && c.textContent.includes('販売中') && c.textContent.includes('2026-11-24確認')), 'meta line shows price/stock/lastChecked: ' + (shopRows()[0].children[1] || {}).textContent);
ok(shopTexts().some(t => t.includes('価格・在庫は変動します')), 'price/stock caveat is shown for vendor entries');

// 5) Flag ON -> affiliate URL, sponsored rel, PR marker, disclosure appears
SHOP_CONFIG.affiliateEnabled = true;
const vOn = buildVendorLinks(item2);
ok(vOn[1].href === 'https://example.com/aff/aff' && vOn[1].affiliate === true, 'flag ON: affiliate URL is used');
ok(vOn[0].href === 'https://example.com/products/plain' && vOn[0].affiliate === false, 'flag ON: entry without affiliateUrl stays plain');
openDetail(item2, 1);
const affA = shopRows()[1].children[0], plainA = shopRows()[0].children[0];
ok(affA.rel === 'sponsored noopener' && affA.children.some(c => c.className === 'prMark' && c.textContent === 'PR'), 'affiliate anchor: rel="sponsored noopener" + PR marker');
ok(plainA.rel === 'noopener' && !plainA.children.some(c => c.className === 'prMark'), 'plain anchor in same list: no sponsored / PR');
applyShopDisclosure();
ok(els.prDisclosure.hidden === false, 'PR disclosure appears when the flag is ON');
SHOP_CONFIG.affiliateEnabled = false;
applyShopDisclosure();
ok(els.prDisclosure.hidden === true, 'PR disclosure hides again when the flag is OFF');

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL PASS');
process.exit(fails ? 1 : 0);
