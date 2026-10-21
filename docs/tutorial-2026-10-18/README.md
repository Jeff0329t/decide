# 初めて使う人向けチュートリアル

2026-10-18。公開済み。公開コミット: 3733a7286d484ab2511d7137bf24b872eb7272d7。

## 変更

- 初回起動では表紙画面にいるため、従来の quickstart 限定の条件で自動案内が始まらなかった。表紙からも開始できるよう修正。
- 「気になる人に連絡してみようかな」という例で、引く・考える・記録する・後日振り返る流れを案内。
- 意味を暗記する必要がないこと、練習は保存されないことを最初に表示。
- キーワード選択後の1.4秒の自動遷移をやめ、利用者がボタンで進める。
- 読み取り中にカード詳細を開ける。Escapeでは詳細だけ閉じ、練習に戻る。
- 最後に、カードの絵・名前のタップで詳しい意味が読めること、設定の「カード図鑑」、ホームの「使い方を見る」を案内。
- 完了後はホームから自分の迷いで始める。完了・スキップ後の再訪では自動表示しない。既存ログや共有リンクの保護条件は維持。

## 検証

- `node --test tests/*.test.mjs`: 302件成功。
- `node --check dist/app.js`、`git diff --check`: 成功。
- `scripts/browser-tutorial-smoke.cjs`: Chromeで320×568 / 390×844 / 430×932の操作を検証。
- 初回表示・手動での読み進め・カード詳細とEscape・練習完了・ログ未保存・再訪・再表示・スキップ・既存ログありの非表示を検証。
- `navigator.standalone` を使ったホーム画面アプリ相当の分岐で、初回表示・詳細から戻る・スキップ後の操作可能状態を検証。iPhone実機での検証ではない。
- 各幅の画像をこのフォルダに保存。初回画面は短い端末ではスクロールして読める。

## 対象と復元

変更対象は `dist/app.js`、`dist/styles.css`、`dist/service-worker.js`、`tests/p11-tutorial.test.mjs`、`tests/fixtures/sw-shell-fingerprint.json`。回帰確認用スクリプトと本記録を追加。
作業前の対象ファイルを `backups/tutorial-2026-10-18/` に保存。既存の未コミット変更を含むため、復元にはこのバックアップを利用する。
Service Workerは v184 に更新し、フィンガープリント再生成済み。

## 追加：カードの初期設定

新規利用者は「シンプル」（大アルカナ22枚・正位置のみ）で開始。不正な設定値の復旧先もシンプルに統一。既存の deckMode と、旧 reversed 設定の引き継ぎは維持する。
設定変更は localStorage の decide.tarot.settings.v1 に保存され、同じブラウザ・端末での再訪に引き継がれる。端末間共有ではない。チュートリアルの完了・スキップも端末内に保存される。
Service Workerは v185 に更新。302件のテスト成功。Chromeで新規初期値、保存済みモードの保持、旧設定の互換性、不正値の復旧、変更後の再読み込みを確認。

## 公開確認

公開先: https://decisionprocess.net/
Pages run: https://github.com/Jeff0329t/decide/actions/runs/39082051822 （成功）。
最新の github/main を基に /tmp/decide-tutorial-release-20261018 へ今回の変更だけを分離し、302件のテストとスマホ3サイズ・standalone分岐の操作を再検証して公開。
公開サイトの index.html / app.js / styles.css / service-worker.js / config.js / auth.js / learn.js / manifest.webmanifest / email-reminders.js が公開用ファイルとバイト一致。結果は public-comparison.json に保存。
iPhone実機や既存PWAの更新受信は未検証。

## 追加修正：短く、やさしい言葉へ（公開済み）

公開済み3733a72のあとに、チュートリアルを中学生にも伝わりやすい言葉へ調整。
「引く・決める・ふり返る」の日本語見出し、友だちに連絡する例、「ログ＝保存したメモ」、「見送る＝今回はやめる」「保留する＝あとで決める」の説明に変更。選んだ行動に応じて見本メモも切り替わる。詳しい意味やカード図鑑の案内も短縮。
302件のテスト、スマホ3サイズとstandalone分岐での操作確認が成功。このフォルダの画面画像は今回のローカル版。SHELL_CACHEはv186。作業前バックアップはbackups/tutorial-plain-2026-10-18/。

## 追加修正と表紙の入口を公開

2026-10-18、d039bdd0fd96e4afacc4707054b19eec3ee818b0 を公開。
やさしい説明・選択肢の補足・表紙の「使い方を見る」を含む。表紙の開始操作と案内ボタンはスマホ3サイズで重ならず押せることを確認。
Pages: https://github.com/Jeff0329t/decide/actions/runs/39083817246 （成功）。
分離した公開用の版で302件のテストとスマホ3サイズ・standalone分岐の操作確認が成功。主要9ファイルが公開版とバイト一致。SHELL_CACHEはv187。証跡はpublic-comparison-plain-cover.json。実機のPWA更新は未検証。

## 表紙のカード図鑑への入口（公開済み）

2026-10-18、「使い方を見る」の右に「カード図鑑」を追加。共通の枠内で横並びにし、アプリ内の図鑑78枚へ直接移動する。図鑑から戻ると表紙へ戻れる。
302件のテスト、スマホ320/390/430pxの表示と操作、両ボタンの非重複・図鑑の詳細閲覧・表紙への戻り・既存チュートリアルの再表示を確認済み。画像は各幅のcover-help.png。
対象ファイルはdist/app.js、dist/index.html、dist/styles.css、dist/service-worker.js、tests/fixtures/sw-shell-fingerprint.json、scripts/browser-tutorial-smoke.cjs。変更前をbackups/splash-atlas-2026-10-18/に保存。SHELL_CACHEはv189。

表紙のカード図鑑ボタンは、関連記事・学習レッスンとともに0608ea4で公開済み。Pages run 39086543521、公開ファイル照合も成功。
