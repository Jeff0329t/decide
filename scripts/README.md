# scripts

## build-cards.mjs — SEO用カード解説ページの生成

```bash
node scripts/build-cards.mjs
```

生成物（すべて上書き）:

- `dist/cards/index.html` … 78枚の一覧
- `dist/cards/{id}.html` … 各カード（ar00〜ar21 / wa,cu,sw,pe + 01〜14）
- `dist/sitemap.xml` / `dist/robots.txt`

### 文章を直すとき

1. カード固有の追加文は `scripts/data/cards-extra-*.json`（`{ id: { hint, scene, check } }`）を編集
2. `node scripts/build-cards.mjs` を再実行（文字数が800字未満のページがあると警告が出ます）
3. `node --test tests/*.test.mjs` で確認

`dist/cards/` 内のHTMLを直接編集しても、次回ビルドで上書きされます。

### 注意

- カードページはJS不要の静的HTML。Service Worker は `/cards/`・`sitemap.xml`・`robots.txt` をキャッシュしません。
- ドメインは `https://decisionprocess.net` 固定（canonical / OGP / sitemap）。変更時はスクリプト冒頭の定数を変更して再ビルド。
- 画像クレジット: images: sixseeds/tarot-api, public domain
