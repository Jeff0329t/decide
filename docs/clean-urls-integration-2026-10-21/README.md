# Clean URL 統合（2026-10-21）

## 保存先

- 元のローカル main: `3af22a76cecffaee25cf529f013ea54cdf7f4030`（変更していない）
- WIP ブランチ: `wip/local-before-clean-urls-20261021`
- WIP コミット: `aa0414b`（変更122件・未追跡324件、全446ファイルを保存）
- 統合ブランチ: `integration/clean-urls-20261021`
- 取り込んだ github/main: `2a7a626afc5c00a07e2810108cc3f87c349921db`
- 元の main から19コミット分を取り込んだ。最後の4件が今回の clean URL 変更。

## 衝突の解消

WIP の本体は、今回の4コミット直前 `7c58f4a` とほぼ一致していた。
`docs/` を除く差は README、CSS の並び順、shell fingerprint だけだった。
108ファイルの衝突について、内容を比較したうえで clean URL 仕様を保持した。

- `dist/consultation-ui.css`: ローカルの並び順をそのまま保持。
- `dist/service-worker.js`: github/main の遷移条件を保持し、SHELL_CACHE を v193 に更新。
- `node scripts/update-sw-fingerprint.mjs` で fingerprint を更新。
- その他の衝突: github/main の内容を採用。
- `scripts/build-cards.mjs` の notFoundPage と dist/404.html の書き出しを保持。
- URL は .html なし、出力ファイル名は .html のまま。
- Stripe success_url は既存の success.html のまま。

## 検証

- `node --test tests/*.test.mjs`: 314件合格、失敗・skip なし。
- `git diff --cached --check`: 合格。
- カード・記事ページ、cards.json、生成スクリプト、404、sitemap は github/main と同一。
- 元の docs、cards.json、CSS は WIP とバイト単位で同一。
- 全体ビルドを作業フォルダでは実行していない。既存テストの再生成検証は一時フォルダ内のみ。
- GitHub main と比較した本体の差は CSS、Service Worker のキャッシュ番号、fingerprint の3ファイルだけ。

## 公開状態と残る注意

push、ローカル main への反映、DNS・Cloudflare・Supabase の設定変更は実施していない。
今回の統合はローカル検証のみ。公開環境の検証は実施していない。
今後公開する場合は事前にユーザー確認を行い、GitHub Actions と Cloudflare Pages の双方を確認する。
カードを全体再生成すると現在のカードデータに由来する本文差分が入るため、別途ユーザー確認が必要。
既知の /icon.svg 不在は今回の統合では変更していない。

退避前の全ファイル一覧は `before-changes.md`、テスト出力は `tests.log`。
