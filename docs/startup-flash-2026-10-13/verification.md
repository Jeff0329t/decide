# 起動直後のリンク表示の修正

最初のHTMLに通常の開始画面を入れ、JavaScriptで描画されるまでの青いリンク表示をなくした。カード一覧への代替リンクはnoscript内に移動。bodyの初期状態をホームの開始画面に合わせた。

変更前の対象ファイルはbefore/へ保存。Service Workerのシェルキャッシュをv164からv165へ更新し、フィンガープリントを再生成。

検証：
- node --test tests/*.test.mjs：270件成功。
- ローカルChrome、320/390 × 844：JavaScriptの取得を保留しても開始画面が表示され、代替リンクは非表示。
- JavaScript読み込み前後の開始画面の位置とサイズが一致。
- 開始画面のタップ領域から次の画面へ遷移。
- git diff --check：成功。

公開サイトへの反映、iPhone実機、インストール済みPWAの更新、iOS側のプレビュー表示は未検証。

## ホーム画面アプリの起動画像への対策

ホーム画面から起動する場合だと判明したため、iPhone用apple-touch-startup-imageを追加。13種類の縦向き画面寸法に対応した#050505のPNGを指定。manifestのbackground_colorも#050505へ統一。iOS側の保存画像を使う代わりに黒い背景を指定する対策であり、iOSの起動アニメーションそのものを消す変更ではない。

根拠：AppleのSafari Web Content Guide / Configuring Web Applications / Specifying a Launch Screen Image（アーカイブ資料）。起動画像未指定時は前回起動時のスクリーンショットが使用されるとの記載。
https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html

13画像のPNGヘッダー寸法とmedia条件の一致、参照ファイルの存在を確認。追加した起動画像は全体約147KBで、Service Workerで一括プリキャッシュしない。既存テスト270件成功、git diff --check成功。変更前はios-before/へ保存。

公開反映とiPhone実機での起動確認は未実施。保存済みの起動画面が更新されるかは、既存のホーム画面アプリで検証する必要がある。

## 公開反映

2026-10-13 JST：GitHub mainのf14744dを基に、起動表示の修正だけを一時チェックアウトで検証して公開。共有作業ツリー内の別の未確定変更は含めていない。

- 公開コミット：0acbaac0083123dced4357ac59f456424a69ebcc
- キャッシュ：decide-shell-editorial-v173
- 公開内容でのテスト：270/270成功。
- GitHub Pages：run 38350773773成功。
- https://decisionprocess.net/ のHTML、manifest、service-worker、起動PNG13枚、計16ファイルが公開コミットと完全一致することを取得して確認。
- iPhone実機で保存済みの起動画像が更新されるかは未確認。
