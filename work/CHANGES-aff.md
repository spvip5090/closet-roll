# CLOSET ROLL 購入導線・アフィリエイト構造 変更まとめ（2026-11-24）

対象は `work/` のみ。`original/` は無変更。**score2.js（採点ロジック）、cards.js、attrs.js は一切変更していない。** ASP等への登録・申請は一切行っていない（ユーザーの承認が必要なため）。

変更ファイル：新規 `shops.js`、`extras.js`（詳細シートの購入スロット）、`index.html`（shops.js 読込＋開示文）、`style.css`（購入リストのスタイル）。

---

## 1. 購入データ層 `shops.js`（商品データと分離・1対多）

- `SHOP_DATA`：商品IDをキーに、1商品へ複数の購入先を登録できる構造。
  エントリ形式：`{vendor, url, affiliateUrl|null, asp|null, price|null, currency, stock, condition, match, lastChecked, source}`
  - `stock` は列挙：`販売中`／`在庫切れ`／`販売終了`／`リンク切れ`／`不明`（`リンク切れ` は表示から自動除外）
  - `condition`：`新品`／`中古`、`match`：`同一商品`／`検索リンク`（一致精度）
- **現在の登録件数は 0 件。** 実在を検証できた同一商品ページが無いため、推測の商品ページURLは1件も入れていない（架空リンク禁止を厳守）。ファイル冒頭コメントに記入形式の説明とダミー例（example.com、実データではない旨を明記）を置いた。
- 唯一の生成口 `buildVendorLinks(item)`：
  - 登録エントリがあればそれを返す。無ければ全商品共通の検索リンクを生成する。
  - アフィリエイトURLへの差し替えはこの関数の中で一括に行う（将来の切替ポイントはここ1箇所）。

### 実エントリの追加方法
`shops.js` の `SHOP_DATA` に、実在を確認した商品ページだけを以下の形で足す（確認日と取得元を必ず記録）：

```js
"<商品ID>": [
  { vendor:'販売店名', url:'https://（確認済みの商品ページ）',
    affiliateUrl:null, asp:null, price:3980, currency:'JPY',
    stock:'販売中', condition:'新品', match:'同一商品',
    lastChecked:'2026-11-24', source:'公式ストアで手動確認' }
]
```

## 2. 全商品フォールバック：検索リンク生成（クリック時生成・API不使用）

登録の無い商品には、ブランド名＋商品名から以下の検索結果ページへのリンクをクリック時に組み立てる（プレイごとのAPIコールなし、キー類はコード内に無し）：

- 楽天市場検索 `https://search.rakuten.co.jp/search/mall/<brand+name>/`
- Amazon.co.jp 検索 `https://www.amazon.co.jp/s?k=<brand+name>`
- ウェブ検索（Google）

いずれも現時点では**通常リンク（アフィリエイトなし）**。UIでは必ず「検索リンク」タグ付きで表示し、同一商品ページと誤認させない。

## 3. 詳細シートの購入スロット（extras.js `renderShopSlot`）

- 登録エントリがある商品：購入先リストを表示。各行に販売店名リンク＋メタ情報（販売価格・在庫状態・中古表示・最終確認日）。末尾に「価格・在庫は変動します。最新の情報はリンク先でご確認ください。」の注意書き。
- 登録が無い商品：「この商品を探す」見出しで上記3検索リンクを表示し、「リンク先は各サイトの検索結果ページです。同じ商品が表示されるとは限りません。」と明記。
- アフィリエイトリンク（後述のフラグON＋affiliateUrl設定時）だけ `rel="sponsored noopener"` ＋「PR」マーカー付き。通常リンクは `rel="noopener"`。
- 従来の `productLink()`（cards.js 側フィールド由来の旧導線）も互換のため先頭にマージされる（現データでは該当0件）。

## 4. アフィリエイト切替と広告表記（単一フラグ）

- 切替は `shops.js` の `SHOP_CONFIG.affiliateEnabled` の1箇所だけ。現在は **false（出荷状態OFF）**。
- 提携が完了したら：対象エントリに `affiliateUrl`（と `asp`）を設定し、フラグを true にする。それだけでリンク差し替え・sponsored/PRマーカー・広告表記が一斉に有効になる。フラグOFFの間は、データに affiliateUrl があっても通常URLが使われる（テストで確認済み）。
- 広告表記：「遊び方・利用について」内に `<p id="prDisclosure" hidden>`「一部の商品リンクはアフィリエイト（広告）です。リンク先で購入されると、運営に収益が発生する場合があります。」を用意し、フラグON時のみ `applyShopDisclosure()` が自動表示する。**現在は検索リンクのみで広告ではないため、表記は出していない**（出していないことが正確な状態）。
- 現在の状態に即した正直な注記として、利用案内には常時表示で「商品詳細の「探す」リンクは、商品を探すための外部サイト（検索結果ページ）へのリンクです。同じ商品が表示されるとは限りません。」を追加した。

## 5. 計測フック（クリックイベント）

購入／検索リンクのクリックで、既存の `closet:event` 機構（integrations.js のリスナー）に以下を発火する（ネットワーク送信なし、解析アダプタが後付け可能）：

```js
eventLog('vendor_click', { type:'vendor_click', itemId, vendor, matchType })
// → detail = { name:'vendor_click', type:'vendor_click', itemId, vendor, matchType }
```

## 6. カバレッジ（2026-11-24 時点）

| 区分 | 件数 | 割合 |
|---|---|---|
| 全商品 | 1,318 | 100% |
| 実購入先エントリあり（同一商品ページ） | 0 | 0% |
| 検索リンクのみ（全商品に生成） | 1,318 | 100% |

## 7. 正直な制約・残作業

- 同一商品のアフィリエイト対応は、販売店・ASPごとに提携可否の確認、審査、商品単位の照合が必要で、今回の構造整備だけではカバーできない。**ASP登録・提携申請はユーザーの承認が必要なため一切行っていない。**
- 検索リンクは導線の最低ラインであり、同一商品にたどり着ける保証はない（UI・利用案内でその旨を明示済み）。
- 価格・在庫は登録時点の情報で、自動更新の仕組みは無い（SPEC の一括取得・更新は提携後の別フェーズ）。

## 検証（実施済み）

- `node --check`：work/ の全JS（cards/shops/attrs/score2/stats/integrations/extras/game）合格。
- 既存スモークテスト `build/test-ui.js`：shops.js を読み込むよう更新し、詳細スロットのアサーションを「検索リンク3件・通常rel」に差し替えて**全件合格**。
- 新規 `build/test-aff.js`：**全26アサーション合格**。内訳：
  - 出荷データが空・フラグOFF・広告表記が隠れたままであること
  - 通常商品に検索リンク3件（楽天/Amazon/Google、ブランド名含むURL、全て「検索リンク」表記）
  - 詳細シートで検索リンクが通常rel・PRマーカーなしで描画され、注意書きが出ること
  - クリックで `vendor_click` イベント（itemId/vendor/matchType付き）が1回発火すること
  - テスト用フィクスチャ（実データには含めない）での購入先描画：価格・在庫・確認日のメタ表示、「価格・在庫は変動します」注意書き、リンク切れエントリの除外
  - フラグOFFでは affiliateUrl があっても通常URL・通常rel・PRなし／フラグONで affiliateUrl 差し替え・`sponsored noopener`・PRマーカー・広告表記の自動表示（OFFに戻すと再び隠れる）
- バンドル再生成：`build/bundle.py` で dist の preview / widget 両バンドルを再生成。shops.js がインライン化されていること（インラインスクリプト8本、全て構文チェック合格）、widget版に localStorage 残存なし、を確認。

## 変更ファイル一覧
- [work/shops.js](sandbox://workspace/closet-roll/work/shops.js)（新規）
- [work/extras.js](sandbox://workspace/closet-roll/work/extras.js) / [work/index.html](sandbox://workspace/closet-roll/work/index.html) / [work/style.css](sandbox://workspace/closet-roll/work/style.css)
- [work/CHANGES-aff.md](sandbox://workspace/closet-roll/work/CHANGES-aff.md)（本ファイル）
- テスト：[build/test-aff.js](sandbox://workspace/closet-roll/build/test-aff.js)、[build/test-ui.js](sandbox://workspace/closet-roll/build/test-ui.js)（更新）
- バンドル：[dist/closet-roll-v2-preview.html](sandbox://workspace/closet-roll/dist/closet-roll-v2-preview.html) / [dist/closet-roll-v2-widget.html](sandbox://workspace/closet-roll/dist/closet-roll-v2-widget.html)（再生成）
