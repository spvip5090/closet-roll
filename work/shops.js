// ============================================================
// CLOSET ROLL 購入導線データ層 (shops.js)
// ------------------------------------------------------------
// 商品データ (cards.js) とは分離して管理する。cards.js には一切手を入れない。
// 商品IDをキーに、1商品へ複数の購入先 (vendor) を紐付けられる構造。
// 抽選・採点・コメント生成はこのファイルに依存しない（表示専用の層）。
//
// SHOP_DATA = { "<商品ID>": [ vendorEntry,...],...}
// vendorEntry = {
// vendor: '販売店・サイト名', // 例: '楽天市場' 'ブランド公式ストア'
// url: 'https://...', // 通常の商品ページURL（実在を確認したものだけ）
// affiliateUrl:'https://...' | null, // アフィリエイトURL（提携後に設定。未提携は null）
// asp: 'ASP名' | null, // 例: 'A8.net' '楽天アフィリエイト'
// price: 12345 | null, // 確認時点の販売価格（不明は null）
// currency: 'JPY', // 通貨コード
// stock: '販売中', // '販売中'|'在庫切れ'|'販売終了'|'リンク切れ'|'不明'
// condition: '新品', // '新品'|'中古'
// match: '同一商品', // '同一商品'|'検索リンク'（一致精度）
// lastChecked: '2026-11-24' | null, // 最終確認日 (YYYY-MM-DD)
// source: '取得元・確認方法' | null // 例: '公式ストアで手動確認'
//}
//
// ※形式の説明専用のダミー。実データではないのでコピーして使わないこと。
// "p0000000000000000": [
// { vendor:'例ストア', url:'https://example.com/products/1',
// affiliateUrl:null, asp:null, price:3980, currency:'JPY',
// stock:'販売中', condition:'新品', match:'同一商品',
// lastChecked:'2026-11-24', source:'手動確認'}
//]
//
//
// - 実在を確認していない商品ページURLは絶対に書かない（架空リンク禁止）。
// - stock が 'リンク切れ' のエントリは buildVendorLinks() から除外される。
// - APIキー等の機密情報はこのファイル（ブラウザ側コード）に書かない。
//
//
// 提携・審査が完了したら、対象エントリに affiliateUrl を設定し、
// SHOP_CONFIG.affiliateEnabled を true にするだけでよい。
// buildVendorLinks() が一括でアフィリエイトURLを優先し、詳細シートでは
// rel="sponsored noopener" + PRマーカー付きで描画され、
// 同時に「遊び方・利用について」内の広告表記 (#prDisclosure) が自動で表示される。
// ============================================================

const SHOP_CONFIG = {
// アフィリエイトリンクを有効化する単一のフラグ。
// 提携前は false：affiliateUrl がデータにあっても通常URLを使い、広告表記も出さない。
affiliateEnabled: false
};

// 購入先データ本体。現在は実在を確認済みの同一商品ページが無いため空。
// 全商品には buildVendorLinks() が生成する「検索リンク」がフォールバックとして付く。
const SHOP_DATA = {
};

// 商品IDから登録済み vendor エントリ（生データ）を返す。未登録は空配列。
function shopEntries(item) {
if (!item || typeof SHOP_DATA!== 'object') return [];
const list = SHOP_DATA[item.id || item.source];
return Array.isArray(list)? list: [];
}

// 検索リンクの生成（全商品共通のフォールバック）。
// ブランド名＋商品名で各モールの検索結果ページへ飛ばすだけの通常リンク。
// プレイのたびに外部APIは呼ばない（クリック時に遷移するだけのURL文字列生成）。
function shopSearchLinks(item) {
const q = encodeURIComponent(((item.brand || '') + ' ' + (item.name || '')).trim());
return [
{ kind: 'search', vendor: '楽天市場', label: '楽天市場で探す', href: 'https://search.rakuten.co.jp/search/mall/' + q + '/', affiliate: false, match: '検索リンク'},
{ kind: 'search', vendor: 'Amazon.co.jp', label: 'Amazonで探す', href: 'https://www.amazon.co.jp/s?k=' + q, affiliate: false, match: '検索リンク'},
{ kind: 'search', vendor: 'ウェブ検索', label: 'ウェブで探す', href: 'https://www.google.com/search?q=' + q, affiliate: false, match: '検索リンク'}
];
}

// 購入導線の唯一の生成口。詳細シートはこの関数の戻り値だけを描画する。
// 戻り値: [{kind:'shop'|'search', vendor, label, href, affiliate, match,
// price, currency, stock, condition, lastChecked, asp, source},...]
// - 登録済みエントリがあればそれを返す（リンク切れは除外）。
// - 無ければ全商品共通の検索リンク（match:'検索リンク'）を返す。
// - アフィリエイトURLへの差し替えはここで一括に行う（将来の切替ポイント）。
function buildVendorLinks(item) {
const out = [];
for (const e of shopEntries(item)) {
if (!e ||!/^https:\/\//.test(e.url || '')) continue;
if (e.stock === 'リンク切れ') continue;
const useAff =!!(SHOP_CONFIG.affiliateEnabled && e.affiliateUrl && /^https:\/\//.test(e.affiliateUrl));
out.push({
kind: 'shop',
vendor: e.vendor || '購入先',
label: e.vendor || '購入先',
href: useAff? e.affiliateUrl: e.url,
affiliate: useAff,
match: e.match || '同一商品',
price: (e.price == null? null: e.price),
currency: e.currency || 'JPY',
stock: e.stock || '不明',
condition: e.condition || '新品',
lastChecked: e.lastChecked || null,
asp: e.asp || null,
source: e.source || null
});
}
if (out.length) return out;
return shopSearchLinks(item);
}

// 広告（アフィリエイト）表記の表示切替。
// フラグONのときだけ、利用案内内の #prDisclosure を表示する。
// 現在はフラグOFFなので表記は出ない（検索リンクは広告ではないため）。
function applyShopDisclosure() {
if (typeof document === 'undefined' ||!document.getElementById) return;
const el = document.getElementById('prDisclosure');
if (el) el.hidden =!SHOP_CONFIG.affiliateEnabled;
}
applyShopDisclosure();
