# タロットを学ぶの公開

2026-10-13。ユーザーの公開指示によりコミット c352f5c8bf0affdc380171b4d43e38dc0d2ae82c を github/main へ push。

公開範囲: 閲覧枚数・所要時間の表示削除、図鑑の月と星背景、学ぶの記事一覧と本文の四元素背景、下部固定ナビ、記事から一覧へ戻る操作。別作業のホーム画面インストール案内と consultation-ui.css の未コミット変更は含めていない。

公開対象だけの独立スナップショットで270テスト成功。320/390/430pxのChromeでナビ位置、記事末尾の読んだボタン、戻る、ホーム・ログ・統計への移動を確認。

GitHub Pages実行38347109843成功。https://decisionprocess.net/ の app.js、learn.js、styles.css、service-worker.js、背景画像2枚をHTTPで取得し、公開スナップショットとの完全一致を確認。公開SWは decide-shell-editorial-v163。作業ツリーのfingerprintは別作業を含むため、コミットには公開スナップショットから計算したfingerprintを使用。

実iPhone/Android、既存インストール済みPWAの更新確認は未実施。
