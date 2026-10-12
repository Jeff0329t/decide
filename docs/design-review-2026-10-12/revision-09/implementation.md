# DECIDE.ロゴと確定動作

SEE YOU AGAINと結果CTAに共通のdecideWordmarkを使用。ホームと同じDidot / Bodoni 72、700、字間-.055em、黄色の句点、影なし。SEE YOU AGAINは暗背景にクリームの文字。CTAは黒地にクリームの文字と黄色の点・影。ロゴを中央配置。

CTAは押し込み→小さく戻る→沈んだ位置に止まる420msの動き後に決定画面へ遷移。操作中はdisabled/aria-busy。二重クリック、別セッション、画面離脱は保護。reduced-motionでは動かさず即遷移。記録保存処理のタイミングは変更なし。

ローカルChrome390×844 / 320×568でロゴと非はみ出し確認。CTAの水平中心誤差約0.004px。クリック直後のdisabled/aria-busy/decide-sealを読み取り、遷移成功確認。QA専用オリジンで1件保存してSEE YOU AGAINを開き、書体・太さ・字間・ドット色・影なしをホームと照合。ユーザーの通常オリジンの記録は追加していない。267テスト成功、node構文・git diff --check成功。実機確認・公開は未実施。

SW v148。直前バックアップはbackups/2026-10-12-logo-confirm/。復元時は該当ファイルを戻し新しいSWキャッシュ名を付け、node scripts/update-sw-fingerprint.mjsを実行。テストも変更前へ戻す。
