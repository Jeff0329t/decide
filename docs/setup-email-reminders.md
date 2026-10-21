# Gmail + Google Apps Scriptでリマインドを送る

2026-10-16：送信専用のGmail + Google Apps Script方式。送信元は `decisionprocess.decide@gmail.com`。本番DBに本機能のmigrationだけを適用し、接続関数 `send-email-reminders` を配置済み。Supabaseに送信元と専用共有キーを設定済み。認証付き接続は200、不正キーは401、送信無効中の予定取得は503を確認。DBのRLSと匿名・クライアントからの直接アクセス制限も確認済み。

サーバーの `EMAIL_DELIVERY_ENABLED`、Apps Scriptの `SEND_ENABLED`、フロントの `EMAIL_REMINDERS_ENABLED` はすべて有効。専用アカウントに[DECIDE リマインド](https://script.google.com/home/projects/1HzfSQs7sv_QVJuHFYpEKF_w7XbW8LmIIpETi3wxpCMUyuWxQBfC1rUNS/edit)を作成し、コード・4種類の権限定義・接続プロパティを保存済み。権限設定、専用キーの保存、本番の自動送信有効化は利用者が明示的に許可済み。Google上での初回認証、接続チェック成功、専用Gmail自身へのテストメール受信、5分間隔トリガー作成、実際の定期実行1回の成功、空予定でのサーバー連携（sent:0、requiresReview:0）まで確認済み。

アプリは公開済み。最新公開版を基に今回のメール通知変更だけを切り出し、コミット `28ef4b6cfe859e5f2ad7d450cf5a7b816b442b64`、[Pages run 38820386476](https://github.com/Jeff0329t/decide/actions/runs/38820386476) の成功を確認。公開9ファイルがリリースと完全一致し、キャッシュ名は `decide-shell-editorial-v181`。証拠は `docs/email-reminders-2026-10-16/public-file-verification.json`。元の作業フォルダの別変更は公開に含めていない。

受信証拠：`docs/email-reminders-2026-10-16/gmail-self-test.jpg`。テスト関数 `sendTestEmail` は専用アドレス自身にだけ送信し、リマインド予定は取得しない。このテストは、予定日時に基づく実送信やアプリ公開の検証とは別。

## 1. 専用のGmailアドレスを作る（利用者）

[Googleアカウント作成](https://accounts.google.com/signup)から、DECIDEの送信専用アカウントを作る。「既存のメールアドレスを使用」ではなく、新しいGmailアドレスを取得する。

作成済みの送信元：`decisionprocess.decide@gmail.com`。Apps Script自体にメールアドレスを作る機能はない。

作成後、実装担当にGmailアドレスだけ伝える。パスワード・確認コード・復旧情報は共有しない。お名前.comのドメインやDNSの変更、新しい有料メール契約は不要。

## 2. サーバー接続の準備（実装担当）

対象Supabaseは `ppuyenvuepxqqrhiswwb`。

1. `supabase/migrations/20261016000000_email_reminders.sql` を適用する。これは本機能の未適用migrationとして作成したもの。他の未適用migrationをまとめて適用しないよう、事前に差分を確認する。
2. `supabase functions deploy send-email-reminders --project-ref ppuyenvuepxqqrhiswwb --no-verify-jwt` でApps Script専用の接続関数をデプロイする。
3. 暗号学的な乱数で32バイト以上の専用共有キーを作り、Supabase Secretsの `GAS_WORKER_SECRET` に保存する。既存のプッシュ通知用 `CRON_SECRET` は使い回さない。
4. Secretsに `GAS_SENDER_EMAIL`（専用Gmailアドレス、小文字）と `EMAIL_DELIVERY_ENABLED=false` を設定する。既存の `SITE_URL=https://decisionprocess.net` を使う。
5. Apps Script側には専用共有キーだけを渡す。Supabaseのservice_roleキー・DB接続情報は渡さず、フロントにも置かない。

この接続関数に任意の宛先・メール本文を渡すことはできない。送信対象は、アプリで明示的にONにした確認済みアカウントの予定のみ。

## 3. Apps Scriptを登録する（専用Gmailでログインして作業）

1. [Apps Script](https://script.google.com/)で新しいプロジェクトを作り、名前を「DECIDE リマインド」にする。
2. `google-apps-script/Code.gs` の内容を `コード.gs` へコピーする。
3. プロジェクトの設定からマニフェストファイル表示をONにし、`google-apps-script/appsscript.json` の内容を `appsscript.json` へコピーする。
4. プロジェクトの設定 → スクリプトプロパティに次の値を保存する。

| 名前 | 値 |
|---|---|
| `WORKER_URL` | `https://ppuyenvuepxqqrhiswwb.supabase.co/functions/v1/send-email-reminders` |
| `WORKER_SECRET` | サーバーの `GAS_WORKER_SECRET` と同じ専用共有キー |
| `SENDER_EMAIL` | `decisionprocess.decide@gmail.com` |
| `SEND_ENABLED` | `false` |

5. `checkConnection` を実行し、専用アカウントで権限を許可する。この関数は接続と残り送信枠を確認するだけで、予定の取得・メール送信をしない。
6. `installTrigger` を実行する。5分ごとのトリガーを1つ作る。`SEND_ENABLED=false` の間は送信しない。

スクリプトは非公開のまま使う。ウェブアプリとしてデプロイする必要はない。トリガーは作成したGoogleアカウントの権限で動くため、個人用アカウントではなく専用アカウントで作成する。

### 新規作成で「ファイルを開くことができません」となる場合

2026-10-16、複数アカウントでの新規作成が `/accounts?authuser=1...` に戻りエラーになった。専用アカウントだけで再ログインした後は作成に成功。GoogleはApps Scriptの複数アカウント同時ログインを非対応としている。[Google公式の対処手順](https://developers.google.com/apps-script/guides/support/troubleshooting)

## 4. 受信テストと公開（実装担当・利用者）

1. サーバーの `EMAIL_DELIVERY_ENABLED=true` に切り替える。
2. 本番公開前に、ローカルの検証画面から自分のGoogleアカウントの予定だけを登録する。
3. 専用Gmail側のApps Scriptで `enableSending` を実行する。この操作以降、実際のメールが送られる。続いて `runReminders` を実行して自分の受信箱で確認する。
4. 差出人が専用Gmail、表示名が「DECIDE.」になり、決定の本文が含まれていないことを確認する。同じ予定で繰り返し実行しても重複しないこと、OFF・解除・ふり返り・削除がサーバー反映後に送信を止めることを確認する。
5. Apps Scriptの「実行数」でトリガーの動作を確認し、検証用の予定を片付ける。
6. 最後にフロントの `EMAIL_REMINDERS_ENABLED=true`、プライバシーポリシーの「提供準備中」表記を更新し、キャッシュ名とfingerprintを更新して公開する。

## 動作と運用上の制限

- メールの差出人は専用Gmail。宛先はDECIDEにログインしているGoogleアカウントの確認済みメールアドレス。利用者にGmail送信権限を求めない。
- Apps Scriptでは、受信箱を読めない[MailApp](https://developers.google.com/apps-script/reference/mail/mail-app)を使う。送信専用アカウントに、メール送信・外部通信・トリガー作成・実行者メールアドレス確認の権限を求める。
- 個人Googleアカウントの標準送信枠は1日100宛先。アプリ全体でこの枠を共有する。新規・試用アカウントでは追加の制限があり得るため、実行時の残り枠を確認し、枠がない間は予定を取得しない。[Google公式の制限](https://developers.google.com/apps-script/guides/services/quotas)
- 5分ごとに最大20件。設定時刻ぴったりの受信は保証しない。送信枠、混雑、Googleの実行遅延により遅れる場合がある。未送信対象は予定日から7日以内。
- ON/OFFと予定は端末ごと。同じログID・同じ日時が複数端末にある場合、アカウント単位で1通にする。他の端末でもONなら、その端末でもOFFにする。
- ログアウト前に、この端末のメール予定を停止する。停止できない場合はログアウトを中断し、再試行を案内する。アカウント削除時は予定・送信記録も削除する。
- アカウントを切り替えると端末の登録IDを変更し、新しいアカウントでは明示的なON操作を必要とする。
- 保存に成功した変更だけを送る。オフラインの取消・ふり返り・削除・予定変更は、オンラインでアプリを開いて登録が成功してから反映される。配信処理中のメールを取り消すことは保証できない。
- 予定がある未評価ログは1端末あたり最大500件。超えた場合は黙って切り捨てず登録を失敗させる。
- MailAppには送信の冪等キーがない。DBで送信権を一度だけ確保してから送る。送信結果が不明な場合も自動再送しないため、重複を防ぐ代わりに、一部の送信失敗は手動確認が必要。Apps Scriptの実行エラーと、DBの `dispatch_started_at is not null and sent_at is null` の記録を確認する。`sent_at` はMailAppが受け付けたことを示し、受信箱への到達保証ではない。
- 配信情報内の宛先は処理開始から30日後以降の定期処理で消去する。ログID・日時・状態の重複防止用記録はアカウント削除まで保持する。送信専用Googleアカウント側の送信記録はGoogleの取り扱いに従う。
- 停止するにはApps Scriptの `disableSending` を実行する。サーバーから緊急停止する場合は `EMAIL_DELIVERY_ENABLED=false`。フロントのフラグだけでは既存のサーバー予定は止まらない。

## ローカル検証

```sh
node --test tests/*.test.mjs
npm install --prefix /tmp/decide-email-validation @electric-sql/pglite --no-audit --no-fund
node scripts/verify-email-reminders-db.mjs /tmp/decide-email-validation/node_modules/@electric-sql/pglite/dist/index.js
```

自動テストは作業フォルダ・隔離リリースとも全301件が成功。Apps ScriptはNodeのモック環境で、権限対象アカウントの一致、残り枠、取消、送信前の予約、送信結果不明時の再送防止、メール通知がOFFのとき通信失敗でログアウトを妨げないことを検証。実際のmigration/RPCは一時的なPostgreSQLで34項目を検証。公開候補の設定画面を320px/390pxで確認し、横へのはみ出しはなし。保存した決定の期日到来に基づく実送信や、既存iPhoneホーム画面アプリの更新・受信はまだ実機未確認。

アプリの設定画面は前回320px/390pxで確認済み（`docs/email-reminders-2026-10-16/`）。今回は送信方式とプライバシーポリシーを変更し、設定画面の構造は変更していない。

元ファイル：`backups/email-reminders-2026-10-16/`。Resend版からの切替前バックアップ：`backups/email-reminders-gas-2026-10-16/`。作業前から存在した他の変更は保持している。
