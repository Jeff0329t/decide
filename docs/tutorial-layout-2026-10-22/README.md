# チュートリアルの配置と背景の調整

2026-10-22。ローカルのみ（未コミット・未公開）。作業前の `styles.css`・`service-worker.js` は `backups/tutorial-layout-2026-10-22/` に保存。

## 問題

- WHY・WHAT・HOW の3画面は中身を上下中央に置いていたため、ページが進んで中身が増えるたびに「次へ」ボタンが下へずれていた（390×844 で 595px → 629px → 679px）。
- 背景の暗いグラデーションが画面の下 3割ほどを真っ黒にしていて、中身の下に何もない黒い余白が残っていた。

## 変更（`dist/styles.css` の末尾近く「Tutorial layout」）

1. WHY・WHAT・HOW は中身を下にそろえ、ボタンを画面の一番下に固定（sticky）。3画面ともボタンの位置が同じになった（375×812 で 788px）。
2. 背景の黒を弱め、コラージュ（手・岩・山の人物）が画面全体に見えるようにした。文字の下は従来どおり黒い下地で読みやすさを保つ。
3. 背景画像の `background-attachment: fixed` を `scroll` に変更（スクロール容器の中では見え方は同じで、iPhone でも同じ表示になる）。
4. 320px など中身が画面に入らないときは、ボタンの後ろに黒いグラデーションの帯を付け、スクロール中の文字とボタンが重ならないようにした。
5. 振り返りの画面：明るい背景に重なる「保存したメモは…」に影を付け、右上の「スキップ」に黒い下地を付けた。

文言・動作・保存の仕組みは変更なし。`service-worker.js` の SHELL_CACHE を v205 に上げ、`tests/fixtures/sw-shell-fingerprint.json` を更新。`scripts/browser-tutorial-smoke.cjs` の画像の保存先をこのフォルダに変更。

## 検証

- `scripts/browser-tutorial-smoke.cjs`：320×568 / 390×844 / 430×932、既存利用者、standalone で成功。各画面の画像をこのフォルダに保存。
- `node --test tests/*.test.mjs`：変更直後は 315件成功。その後、別作業で `dist/cards/` などが更新中のため、カードページの SEO テストと SHELL_CACHE テストの計7件が失敗している（今回の変更とは無関係）。
- iPhone実機・公開版は未確認。
