# カード・悩みページ SEO／回遊改善の承認用サンプル

2026-10-18。調査対象はローカルの `dist/cards/` 全97ページとトップページ、関連する生成元。公開サイトへの反映はしていません。

## 現状と変更方針

- 97ページ = 個別カード78 + 悩み12 + 一覧・カテゴリ7。
- 個別カード・悩み90ページには Article と BreadcrumbList が既存。一覧・カテゴリ7ページには ItemList と BreadcrumbList が既存。
- 既存 Article の description は更新前の文章。最新SEO定義で title/meta は上書きされるが、JSON-LDが同期されない構造。
- 全12悩みページに、他の悩み11件への通常のaリンクがある。これを保持し、一覧導線の文言を「すべてのカード・悩み一覧を見る」に統一。
- 全78カードページに悩みページへの直接リンクがない。本文内容に合う悩みを2〜3件追加。既存 worries.json のカード対応を優先し、cu12 のように対応がない場合は明示的な編集用マッピングを用意し、無関係な自動リンクを避ける。
- カードの前後リンクはデッキ全体の順序。スートの境界で他スートへ移動する箇所があるため、同じ分類の中で前後を計算する。先頭・末尾では片側のみとし、循環はさせない。cu12 は現在の cu11 / cu13 を維持。
- 本文末CTAは両サンプルとも既に存在し、黄色背景・黒ボタンで十分目立つ。CSSは変えず、末尾CTAのコピーを具体的にする。中間CTAは保持。
- `?from=cu12` / `?from=pe04` は card-entry.js の視点ガイドに使用されるため保持。CTAで「そのカードが必ず引ける」とは表現しない。

## 1. JSON-LD

重複追加せず既存を更新する。サンプルごとの全JSONは sample-structured-data.json 参照。

- Article.headline = 最新の title 全文。
- Article.description = 最新の meta description。
- Article.url / mainEntityOfPage = canonical URL。
- author / publisher.name = DECIDE.。
- image・inLanguage・公開日等の既存情報は保持。インデックス対策を理由とした架空の日付更新は行わない。
- パンくずは DECIDE. → タロットカード78枚の意味 → 現在ページの h1。2階層目は cards/index.html の実際の h1 に合わせる。
- 画面のパンくずも同じ階層・名称に合わせる。「戻る」ボタン、分類リンクは保持。
- cards/index.html は2階層、他は3階層。
- 一覧・カテゴリ7ページは既存 ItemList を保持し、headline / name / description / url / publisher を持つ WebPage を追加する。

worry-okane.html の Article 主要項目:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "大きな買い物で迷う時の判断軸｜タロットで決断｜DECIDE.",
  "description": "大きな買い物で迷い、貯金を使うのが不安な人へ。欲しい理由や使う頻度、購入後の家計を整理し、関連するタロットカードと自分への問いかけを通して、今買うか待つかを考えるヒントを紹介します。",
  "url": "https://decisionprocess.net/cards/worry-okane.html",
  "publisher": { "@type": "Organization", "name": "DECIDE.", "url": "https://decisionprocess.net/" }
}
```

## 2. 代表ページの本文変更

### worry-okane.html

- 「ほかの悩みから読む」を「他の悩みから探す」に変更。
- 他の悩み11件へのリンクは保持。
- `/cards/` のリンク名を「すべてのカード・悩み一覧を見る」に変更。
- 末尾CTAの説明: 「『今買う』と『もう少し待つ』。二つの選択肢を、カードの問いかけで整理してみませんか。」
- ボタン: 「買うか待つか、DECIDE.で考える」
- 遷移先: `../?from=pe04`。

### cu12.html

- cu11（カップのペイジ）／cu13（カップのクイーン）、カップ一覧・カード一覧への既存リンクは保持。
- 記事の下部に「このカードの視点で考えたい悩み」を追加。リンクは恋愛・結婚・人間関係の3件と `/cards/`。
- 説明: 「想いを伝えるか、相手の提案を受けるか。近いテーマから、迷いを整理するヒントを探せます。」
- 末尾CTAの説明: 「誘いを受けるか、想いを伝えるか。いまの迷いを、カードを引いて整理してみませんか。」
- ボタン: 「カードを引いて、自分の気持ちを整理する」
- 遷移先: `../?from=cu12`。

## 3. トップページ案（承認後）

静的 index.html の `/cards/` リンクは現在 noscript 内のみ。app.js には開始後の `/cards/` と設定画面の `/cards/worries.html` リンクがあるが、主要な worry-* への直接リンクはない。

トップの既存補助リンク近くに、控えめな通常の a リンクとして「カード・悩み一覧」「転職」「恋愛」「お金」を追加する。初期HTMLと app.js のホーム描画を揃え、JSによる再描画後も残す。ボタンや既存 data-action は維持する。モバイルの表示・タップ領域・スプラッシュ操作との干渉を確認する。

## 承認後の反映方法と検証

- 現在多数の未コミット変更があるため、対象ファイルをまず保存。
- 現在のHTMLを土台にした必要箇所の更新と、再生成時にも維持できる生成元の修正を行う。無条件の一括再ビルドで既存の本文調整を上書きしない。
- build-cards.mjs、lib/cards-seo.mjs、update-cards-seo.mjs と必要な内部リンク定義を同期。metadataのみ更新するコマンドでもJSON-LDが旧文面に戻らないようにする。
- 共通生成器を使う `/articles/` は今回の対象外。共通関数の変更は `/cards/` に限定する。
- 全97ページのJSONパース、種類・重複、title/description/canonicalとの一致、パンくず段数、リンク先実在、悩みへの導線、同分類の前後、末尾CTAを検証。
- 再実行の同一性と生成元の出力整合を確認し、代表ページとトップをモバイル幅で確認。
- 公開・デプロイは今回のサンプル作成には含めない。

## ファイル

- `*.proposed.html`: 適用案そのもの。相対URLは本来の /cards/ 配置を前提とする。
- `*.preview.html`: 単体で開くためだけに base URL と noindex を加えたプレビュー。画像とリンクは公開サイトを参照する。base/noindex は本番適用案には含まれない。
- `*.diff`: 現在のローカルHTMLとの差分。
- `sample-structured-data.json`: 2ページのJSON-LDと末尾CTA。
- `validation.json`: サンプル作成時の確認結果。JSONパース・CSS不変・対象本体ファイル不変を確認。ブラウザー表示とGoogle側の検証は未実施。

構造化データは内容理解を助ける施策で、インデックス登録や検索表示を保証するものではありません。
