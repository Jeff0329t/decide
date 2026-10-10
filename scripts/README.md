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

### 注意

- カードページはJS不要の静的HTML。Service Worker は `/cards/`・`/articles/`・`sitemap.xml`・`robots.txt` をキャッシュしません。
- ドメインは `https://decisionprocess.net` 固定（canonical / OGP / sitemap）。変更時はスクリプト冒頭の定数を変更して再ビルド。
- CTAは `../?from={id}`（分類ページは `../?from={slug}`、悩み別ページは `../?from={代表カードid}`）へリンク。アプリ側は `dist/card-entry.js` が読み取り「◯◯の視点で考える」ガイドを表示し、URLから `from` を消します（localStorageは使いません）。
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
