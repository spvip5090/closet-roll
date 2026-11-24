# CLOSET ROLL UI完成度 変更まとめ（2026-11-24）

対象は `work/` のみ。`original/` は無変更。**score2.js（採点ロジック・配点）、attrs.js、cards.js は一切変更していない**（git diff で確認済み）。パラメーター表示に必要な軸値は score2.js の戻り値 `score.axes` に既に含まれていたため、score2.js への露出追加も不要だった。

変更ファイル：`extras.js` / `game.js` / `index.html` / `style.css`、新規 `ogp.png`。

---

## 1. 図鑑の使い勝手（extras.js / index.html / style.css）
- 遅延描画：図鑑のDOMは「プレイ記録・図鑑」→「商品図鑑」の両方を開いたときだけ構築する（`renderBook()` が `bookBox.open` をガード）。結果表示のたびに走る `refreshRecords()` からは、閉じている間は一切触らない。旧実装はアーカイブを開いているだけで全1,318件を毎回再構築していた。
- デフォルト表示は「獲得済み」（写真サムネイル＋ブランド＋商品名＋部位・価格・所持数）。切替で「すべて」「未獲得」も選べる。
- 検索：ブランド・商品名のテキスト検索（`#bookSearch`）を追加。
- 分割表示：50件ずつ描画し、「もっと見る（残り N 件）」ボタンで追加読み込み。
- 件数サマリーは維持・強化：`収集中 X／1318 · N a/630 · R b/410 · SR c/195 · SSR d/83` を一覧上部に表示。
- 図鑑の各アイテムをタップすると詳細シート（下記2）が開く。

## 2. アイテム詳細シート（extras.js `openDetail` / game.js `card` / index.html / style.css）
- 結果カードと図鑑アイテムのタップで詳細シートが開く（カード内の購入リンクのタップは従来通りリンク優先）。
- 表示内容：写真（大）、レアリティ、部位・系統・性別、ブランド、**正式な商品名（省略なし）**、価格、所持数、属性チップ（色 ※写真推定の場合は明記、柄、素材、シルエット、丈、フォーマル度、季節、主張度、単体の魅力。attrs の根拠があるものだけ表示）。
- 購入導線スロット：`productLink()` でリンクがある商品は従来通りリンクを表示。無い商品は「購入リンクは準備中です（今後ここに購入先が表示されます）」の空スロットを明示（リンクの捏造はなし）。
- 閉じ方：×ボタン、外側タップ、Escキー。

## 3. 共有まわりの整備（index.html / ogp.png）
- `<head>` に meta description、theme-color（#121021）、OGP（og:type/site_name/title/description/url/image）、Twitterカード（summary_large_image）、favicon（インラインSVGデータURI）を追加。
- OGP画像 `ogp.png`（1200×630、PILで生成、ゲームの紫系グラデーション＋タイトル）を同梱。og:url / og:image は正規ベースとして元の公開URL `https://closet-roll-mix.hospitablesaffron6.chatgpt.site/` を使用。

## 4. 画像の堅牢性（game.js / extras.js）
- 先読み：`openPack()` で抽選直後、開封演出の間に5点の写真を `new Image()` でプリロード。
- フォールバック：全アイテム画像（結果カード・図鑑・詳細）に `crImg()` の onerror を結線し、読み込み失敗時は部位ピクトグラム（ポスター用の `garment()` と同じパス）をインラインSVGデータURIで代替表示（二重発火ガード付き）。

## 5. プレイ記録のグリッド化（extras.js `refreshRecords` / index.html / style.css）
- 1行テキスト詰め込みを廃止し、ラベル付き統計グリッドに分割：パック数／最高得点／最低得点／コーデ総額レンジ／SSR／GOD／全身高額／全身節約／一点豪華／図鑑進捗。称号一覧は全幅セルに分離。

## 6. 「採点の内訳」→「コーデ総評」（ユーザーFB 18:56、extras.js `outfitReview` / game.js `finish` / index.html）
- セクション名を「コーデ総評」に変更し、技術的表示を全廃：算術行（基本 X点 → 総合 Y点（上限100））、内部軸名の羅列（score.reason の表示）、ボーナスの点数チップ列挙を削除した。カード上の「系統一致／ブランド一致」マークは従来通り残置。
- 総評は score2 の理由構造（分類 cls、tier、最良/最低軸、plus/minus 理由文、最良/最悪ペア、主役 hero、同ブランド・系統ボーナス）から生成する文章：
  1. 分類に基づく総括（無難／オシャレ／ダサい／個性的でオシャレ／個性的だが成立していない × 価格帯）
  2. 良かった点（具体的なペア相性、色・シルエットの加点理由、同ブランド／同系統の統一感への言及を含む）
  3. 惜しい点（具体的な減点理由と最悪ペア。破綻が無い場合は肯定的な締め。無難×最低軸が高級感の場合は「着こなしの失敗ではない」と明記）
  4. 主役アイテムへの言及（ブランド・部位・商品名）
- 内部軸名は日常語に置換（高級感／色の組み合わせ／上下のバランス／テイストの統一感 等）。数値の羅列もしない。
- 役割分担：得点下コメント＝理由の短い要約（従来通り）、総評＝詳しいレビュー。生成元は同じ理由構造なので矛盾しない。
- サンプル（安価・無難コーデ、総合37点）：総評は「奇をてらわない、穏やかな休日コーデ…」「良かった点は、テイストが揃っていて…」「惜しい点をあげれば、色の組み合わせがもう一歩なところ…」「点数が伸びきらない主因は高級感（価格帯）の分で、着こなしの失敗ではない…」「主役はcocaのトップス『ロゴプリントT』…」となり、「ダサい」を含まないことをテストで確認。

## 7. パラメーター表示（ユーザーFB 18:59-1、extras.js `renderParams` / index.html / style.css）
- 「コーデ総評」セクションの先頭に、内部7軸を横バー一覧で表示（スマホで崩れない形式としてレーダーではなくバーを選択）。バーは scaleX アニメーションで伸び、80以上は金色。
- ラベルは日常語：高級感／単体の魅力／色・柄の相性／シルエット／統一感／完成度／個性。値域は score.axes（0–100）。
- メイン表示（総合・豪華さ・調和）は従来通り維持。**score2.js は無変更**（軸値は既存の戻り値を使用）。

## 8. ボーナスの可視化（ユーザーFB 18:59-2、extras.js `renderBonusChips` / game.js `finish` / index.html / style.css）
- スコア表示（.grade）の直下にボーナスチップを表示：「カジュアル統一ボーナス +2」「UNIQLO × 3 同ブランドボーナス +2」のように、ラベル＋点数を金色ピルで表示し、出現時にポップアニメーション（90msずつのスタッガー）。
- 算術の明細行（基本X点→総合Y点）は引き続き出さない。総評文中の統一感への言及も継続。

## 9. 演出・ビジュアル強化（ユーザーFB 18:59-3、game.js / style.css、CSS中心）
- レア度差別化：N=灰枠、R=青枠＋淡いグロー、SR=紫枠＋紫グロー、SSR=金枠＋強いグロー＋虹色シマー（::before のグラデーションスイープ、CSSアニメのみ）。出現時の溜めも強化（SSR +350ms は従来通り、SR にも +150ms を追加）。
- スコア演出：総合得点にカウントアップアニメーション（650ms、イージング）。85点以上で紙吹雪（既存 `celebrate()` を 'jackpot' テーマで発火）。SSR排出時の祝福は従来通り。
- 開封演出：パックに鼓動感のあるスケールアニメーション（heartbeat）を追加。既存の光の放射・ビーム等はそのまま。
- 色味：背景に紫＋ピンクのラジアルを重ね、スコアパネルにグラデーションを付与。レイアウト骨格と可読性は維持。
- 制約遵守：重いライブラリなし（CSSアニメーション中心）、`gentle()`／prefers-reduced-motion 時はカウントアップ・祝福・各種アニメーションを止める既存配慮を維持、効果音は既存設定（デフォルトOFF）に従い新規の音は追加していない。

---

## 検証（実施済み）
- `node --check`：work/ の全JS（cards/attrs/score2/stats/integrations/extras/game）合格。
- DOMスタブによるスモークテスト `build/test-ui.js`：**全28アサーション合格**。内訳：
  - 図鑑：アーカイブ閉鎖時・図鑑閉鎖時はDOMを構築しないこと、獲得済みのみ描画、件数サマリー文、50件ページング＋追加読み込み、UNIQLO検索の一致件数と全件マッチ。
  - 記録：統計セル11個（10指標＋称号）が .stat で描画されること。
  - 詳細：シート開閉、正式名称表示、購入スロットが「準備中」プレースホルダであること、属性チップ表示。
  - 総評：3段落以上、内部軸名・算術・点数表を含まないこと、主役ブランドへの言及、無難コーデで「ダサい」を含まないこと、得点下コメントと文面が異なること。
  - パラメーター：7行が日常語ラベル順に描画され、数値が score.axes と一致すること。
  - ボーナスチップ：2件描画と文言、ボーナス無しで0件になること。
- サーブ確認：`python3 -m http.server` で work/ を配信し、index.html・ogp.png・各JS/CSS が 200 で返ること、index.html に総評・OGP・図鑑検索・詳細の要素が含まれることを確認。
- OGP画像は生成後に目視確認（文字化けを1回修正済み）。

## バンドル再生成（実施済み）
- `build/bundle.py` で従来と同一の変換（CSS/JSインライン化、CFスクリプト除去、写真URLの絶対化、report/release リンク絶対化。widget版は localStorage シム挿入＋参照置換）を適用し、以下を再生成：
  - [dist/closet-roll-v2-preview.html](sandbox://workspace/closet-roll/dist/closet-roll-v2-preview.html)
  - [dist/closet-roll-v2-widget.html](sandbox://workspace/closet-roll/dist/closet-roll-v2-widget.html)
- 再生成後チェック：両バンドルとも新要素（総評・params・bonusChips・図鑑検索・詳細・OGP）を含むこと、相対写真パスの残存なし、widget版は localStorage 残存なし、インラインJS全7本の `node --check` 合格を確認。
- なお ogp.png と favicon はバンドル内では完結しない（og:image は正規URL参照、favicon はデータURIで完結）。ogp.png は公開時に正規サイトのルートへ配置が必要。

## 変更ファイル一覧
- [work/CHANGES-ui.md](sandbox://workspace/closet-roll/work/CHANGES-ui.md)（本ファイル）
- [work/extras.js](sandbox://workspace/closet-roll/work/extras.js) / [work/game.js](sandbox://workspace/closet-roll/work/game.js) / [work/index.html](sandbox://workspace/closet-roll/work/index.html) / [work/style.css](sandbox://workspace/closet-roll/work/style.css) / [work/ogp.png](sandbox://workspace/closet-roll/work/ogp.png)
- テスト：[build/test-ui.js](sandbox://workspace/closet-roll/build/test-ui.js)、サンプル出力：[build/sample-review.js](sandbox://workspace/closet-roll/build/sample-review.js)、バンドル生成：[build/bundle.py](sandbox://workspace/closet-roll/build/bundle.py)
