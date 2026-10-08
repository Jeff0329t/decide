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
- `og:image` は `dist/assets/og/{id}.png` / `worry-{slug}.png` を参照（下の build-og.mjs で生成）

### 文章を直すとき

1. カード固有の追加文は `scripts/data/cards-extra-*.json`（`{ id: { hint, scene, check } }`）を編集
   - 悩み別ページの文章は `scripts/data/worries.json`（slug・本文・関連カードid）を編集
2. `node scripts/build-cards.mjs` を再実行（文字数が800字未満のページがあると警告が出ます）
3. `node --test tests/*.test.mjs` で確認

`dist/cards/` 内のHTMLを直接編集しても、次回ビルドで上書きされます。

### 注意

- カードページはJS不要の静的HTML。Service Worker は `/cards/`・`sitemap.xml`・`robots.txt` をキャッシュしません。
- ドメインは `https://decisionprocess.net` 固定（canonical / OGP / sitemap）。変更時はスクリプト冒頭の定数を変更して再ビルド。
- CTAは `../?from={id}`（分類ページは `../?from={slug}`、悩み別ページは `../?from={代表カードid}`）へリンク。アプリ側は `dist/card-entry.js` が読み取り「◯◯の視点で考える」ガイドを表示し、URLから `from` を消します（localStorageは使いません）。
- 画像クレジット: images: sixseeds/tarot-api, public domain

## build-og.mjs — OGP画像の生成

```bash
node scripts/build-og.mjs [--only=ar00,worry-tenshoku]
```

- SNSシェア用の 1200x630 PNG を `dist/assets/og/` に出力（カード78枚 + 悩み別ページ）
- ローカルの Google Chrome（headless）で撮影します。パスが違う場合は環境変数 `CHROME` で指定
- `cards.json`・`worries.json` を編集したら再実行（`--only=` で一部だけ再生成可）
