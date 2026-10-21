# カード・悩みページ SEO／回遊改善

2026-10-18。公開・デプロイ完了。コミット `7c58f4a`。公開照合・本番ブラウザー確認の詳細は `release.md`。

## 反映内容

- 全97ページのJSON-LDを最新title/description/canonicalと同期。Article 90件、一覧・カテゴリのWebPage 7件、既存ItemList 7件を保持。
- パンくずは「DECIDE. → タロットカード78枚の意味 → ページのh1」。一覧自体は2段、他は3段。画面表示も同期し、戻るボタンと分類リンクを保持。
- 個別カード78件に関連する悩みを各2〜3件追加。悩み12件には既存の他の悩み11件を保持し、一覧への導線を明確化。
- 前後カードは同じ分類内に限定。末尾CTAの文言を具体化し、既存のCSSとfromパラメーターを保持。
- トップの初期HTMLとJS描画にカード・悩み一覧、転職、恋愛、お金への通常のaリンクを追加。44pxのタップ高さを確保。
- Service Workerをv190からv191へ更新し、フィンガープリントを再生成。

## 生成元と再生成

- `scripts/lib/cards-navigation-seo.mjs`: JSON-LD、パンくず、回遊リンク、CTAの共通更新処理。
- `scripts/data/card-worry-links.json`: 全78カードの悩みリンク編集定義。
- `scripts/build-cards.mjs`: 全体生成の最後に共通処理を適用。
- `scripts/update-cards-seo.mjs`: 現在の本文を保持して、承認されたSEO・回遊・CTAのみを更新。
- `scripts/lib/cards-seo.mjs`: metadataをJSON-LDの前に安定して出力。

既存本文は変更前の保存版と比較し、承認対象のパンくず・前後リンク・末尾CTA・関連リンク以外の本文、画像、CSSが全97件で保持されていることを確認。

## 依頼された2点

1. 確認用 `docs/cards-navigation-seo-proposal-2026-10-18/` はそのまま資料として保持。公開設定 `.github/workflows/pages.yml` は `dist/` のみをアップロード。現在のdistと、生成元から新規生成したdistの両方にプレビュー等がないこと、サイトマップのcards URLが97ページの正規URLのみであることをテスト済み。
2. 現在の本文を再生成で上書きしないよう、別の一時ディレクトリに生成元と必要な入力をコピーして `node scripts/build-cards.mjs` を2回実行。各回の97ページについて構造化データ・リンク・CTAを検証し、2回の出力が一致。実ファイルに対しても `node scripts/update-cards-seo.mjs` を実行し、再適用で内容が変わらないことを確認。

## 検証

- Nodeテスト310件成功、失敗0件。再生成・プレビュー混入防止の回帰テストを含む。
- 全97件のJSON解析、メタ・canonicalとの一致、パンくず段数、リンク先実在、同分類の前後、悩みリンク、末尾CTAを確認。
- Chromeの320×568 / 390×844 / 430×932でトップ・worry-okane・cu12を確認。横はみ出しなし、JavaScriptエラーなし。
- トップの追加リンク、既存カード図鑑・開始ボタン、CTAからアプリの視点ガイドへの遷移を確認。
- 構文・git diff --check成功。
- 画像は同フォルダ、詳細は `validation.json` と `browser-audit.json`。
- 公開サイトは103ファイルの一致とスマートフォン幅での操作を確認済み。iPhone実機、Googleのインデックス登録状況は未検証。

## 復元

変更前の対象HTML・生成元・トップ関連ファイルは `backups/cards-navigation-seo-2026-10-18/` に保存。
