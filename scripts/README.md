# scripts

## build-cards.mjs — SEO用カード解説ページの生成

```bash
node scripts/build-cards.mjs
```

生成物（すべて上書き）:

- `dist/cards/index.html` … 78枚の一覧
- `dist/cards/{id}.html` … 各カード（ar00〜ar21 / wa,cu,sw,pe + 01〜14）
- `dist/cards/{major,wands,cups,swords,pentacles}.html` … 分類別一覧（大アルカナ・各スート）
- `dist/cards/worries.html` / `dist/cards/worry-{slug}.html` … 悩み別ページ（転職・別れ・引っ越し・結婚・学び直し・独立・起業・副業・人間関係・お金・恋愛・就活・介護）
- `dist/sitemap.xml` / `dist/robots.txt`
- `og:image` は `dist/assets/og/{id}.jpg` / `worry-{slug}.jpg` を参照（下の build-og.mjs で生成）

### 文章を直すとき

1. カード固有の追加文は `scripts/data/cards-extra-*.json`（`{ id: { hint, scene, check } }`）を編集
   - 悩み別ページの文章は `scripts/data/worries.json`（slug・本文・関連カードid）を編集
2. `node scripts/build-cards.mjs` を再実行（文字数が800字未満のページがあると警告が出ます）
3. `node --test tests/*.test.mjs` で確認

`dist/cards/` 内のHTMLを直接編集しても、次回ビルドで上書きされます。

### SEO・回遊リンク・CTAの更新

- 最新title/description: `scripts/data/cards-seo.json`。
- 個別カードに関連付ける悩み（各2〜3件）: `scripts/data/card-worry-links.json`。無関係な自動選択を避けるため、カードごとに明示。
- 共通のJSON-LD・パンくず・同分類の前後リンク・末尾CTA: `scripts/lib/cards-navigation-seo.mjs`。
- 本文を再生成せず上記だけを同期: `node scripts/update-cards-seo.mjs`。
- 全体生成の `build-cards.mjs` も同じ共通処理を使う。SEOの更新後もJSON-LDに古いdescriptionが残らない。
- `node --test tests/cards-navigation-seo.test.mjs` は全97件と、隔離した作業ディレクトリでの全体生成・再実行を検証する。
- 確認用HTML・画像は `docs/`、復元用データは `backups/` に置く。Pagesのアップロード対象は `dist/` のみ。これらを `dist/` やサイトマップへコピーしない。


### 注意

- カードページはJS不要の静的HTML。Service Worker は `/cards/`・`/articles/`・`sitemap.xml`・`robots.txt` をキャッシュしません。
- ドメインは `https://decisionprocess.net` 固定（canonical / OGP / sitemap）。変更時はスクリプト冒頭の定数を変更して再ビルド。
- CTAは各ページの最後に1つだけ置き、表紙を飛ばして引き方を選ぶ画面 `../?go=home` へリンクします（記事はアプリ内の読みものでもあるため）。読んだカードはアプリの流れに引き継がれないため、文言は「カードの視点を手がかりに、決めたいことを整理する」までにとどめ、そのカードで占えるような約束はしません。
- 画像クレジット: images: sixseeds/tarot-api, public domain

## 読みもの（記事）— `scripts/data/articles/*.md`

`build-cards.mjs` が記事も生成します: `dist/articles/{slug}.html` と一覧 `dist/articles/index.html`（公開記事が1本以上あるときだけサイトマップ・カード一覧からリンク）。

front matter（`---` で囲む）:

```
slug: tenshoku-mayou-30dai        # URL（英小文字・数字・ハイフン）
title: <title>（32字前後）
h1: ページの見出し
description: 検索結果の説明文（80〜120字）
date: 2026-10-08
updated: 2026-10-20               # 任意
keyword: 狙うキーワード（1記事1つ）
primary: cu08                     # CTA ?from= と OGP に使う代表カード
worries: [tenshoku]               # 任意・関連する悩み別ページ
cards: [cu08, ar00]               # 任意・関連カード
draft: true                       # true の間は公開されない
```

本文は Markdown（`##`/`###` 見出し・段落・リスト・`>` 引用・`**太字**`・`[文字](/cards/worry-tenshoku.html)`）。生HTMLはエスケープされます。`<!-- -->` は出力されないメモ欄です。`##` を2つ以上入れると中間と末尾の2か所にCTAが入ります。本文1500字未満は警告。

- 下書き確認: `node scripts/build-cards.mjs --drafts`（noindex＋「下書き」帯つき、サイトマップには載らない）
- 公開手順:
  1. `draft: false` にする
  2. `node scripts/build-cards.mjs`（**`--drafts` なしで**。下書きページは削除されます）
  3. `node scripts/build-og.mjs --only=article-{slug}`
  4. `node --test tests/*.test.mjs`

## build-og.mjs — OGP画像の生成

```bash
node scripts/build-og.mjs [--only=ar00,worry-tenshoku]
```

- SNSシェア用の 1200x630 JPEG を `dist/assets/og/` に出力（カード78枚 + 悩み別ページ）
- Chrome で撮った PNG を `sips` で JPEG（品質80、1枚150〜190KB程度）に変換。古い PNG は削除されます
- ローカルの Google Chrome（headless）で撮影します。パスが違う場合は環境変数 `CHROME` で指定
- `cards.json`・`worries.json` を編集したら再実行（`--only=` で一部だけ再生成可）
