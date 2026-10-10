# UNLIMITED EDITION 購入（Stripe）セットアップ手順

Phase 3 で追加した「UNLIMITED EDITION 買い切り ¥980」を有効にするための、人間が行う設定作業です。
`docs/setup-auth.md` の 1〜7（ログイン・マイグレーション・`delete-account`）が済んでいる前提です。
Edge Function が未デプロイの間は、購入ボタンを押しても「購入は準備中です」等が出るだけで、他の機能には影響しません。

> 重要：フロント（`dist/`）に置いてよいのは **Supabase の URL と anon（public）キーだけ** です。
> Stripe シークレットキー（`sk_...`）・Webhook 秘密（`whsec_...`）・`service_role` キーは
> **Supabase の Secrets にだけ** 入れ、`dist/` には絶対に書かないでください。
> `node --test tests/*.test.mjs` に、`dist/` にこれらが混入していないかを検査するテストがあります。

## 1. Stripe アカウントとテストモード

1. https://dashboard.stripe.com でアカウントを作成（本番の有効化は後でよい）。
2. 右上の「テストモード」をオンにする。以降 6 まではテストモードで作業します。
3. 開発者 → API キー で **シークレットキー**（`sk_test_...`）を控える。
   公開可能キー（`pk_...`）は今回の方式（Checkout へのリダイレクト）では不要です。

商品（Product）や価格（Price）を Stripe 側で作る必要はありません。
金額（¥980・JPY・1回払い）は `create-checkout` の中で指定しています。

## 2. Edge Function をデプロイ

コマンドは `app` フォルダ（`supabase/` がある場所）で実行します。

```bash
cd "/Users/wajikitoru/DECIDE 開発用2/app"
supabase link --project-ref ppuyenvuepxqqrhiswwb
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy delete-account
```

- `stripe-webhook` は Stripe から呼ばれるため Supabase の JWT を持っていません。**必ず `--no-verify-jwt`** を付けます
  （代わりに Stripe の署名を `STRIPE_WEBHOOK_SECRET` で検証しています）。
- `delete-account` は Phase 3 で購入情報の削除処理が加わったため、再デプロイします。

ダッシュボードの「Via Editor」でデプロイする場合は、`stripe-webhook` の設定で「Verify JWT」をオフにしてください。

`stripe-webhook` をデプロイする前に、チャージバック記録用のマイグレーション
`supabase/migrations/20261009000000_disputes.sql` を適用しておきます（`supabase db push`、または SQL Editor に貼り付けて Run）。
未適用のままチャージバックが来ると記録に失敗し、Stripe が再送を繰り返します。

## 3. Webhook エンドポイントを登録

Stripe ダッシュボード → 開発者 → Webhook →「エンドポイントを追加」：

- エンドポイント URL：`https://ppuyenvuepxqqrhiswwb.supabase.co/functions/v1/stripe-webhook`
- 送信するイベント：
  - `checkout.session.completed`（購入完了 → `profiles.plan_type` を `lifetime` に）
  - `checkout.session.async_payment_succeeded`（コンビニ払いなど遅延決済の入金完了 → `lifetime` に。Checkout はカード払いのみに固定しているため通常は届かないが、将来遅延決済を有効にした場合の備え）
  - `charge.refunded`（全額返金 → `free` に戻す）
  - `charge.dispute.created`（チャージバック発生 → `stripe_disputes` に記録して通知。UNLIMITED EDITION は自動では外しません）
  - `charge.dispute.closed`（チャージバック決着 → 結果（`won` / `lost`）を記録して通知）

作成後、エンドポイントの「署名シークレット」（`whsec_...`）を控えます。

## 4. Secrets を設定

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxxxxxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
supabase secrets set SITE_URL=https://decisionprocess.net
supabase secrets set ALLOWED_ORIGINS=https://decisionprocess.net,http://localhost:8080
# 任意：チャージバックの通知先（Slack の Incoming Webhook URL など）
supabase secrets set ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

- `SITE_URL` / `ALLOWED_ORIGINS` は手順 setup-auth.md の 6 で設定済みなら不要です。
- 決済後の戻り先（`success.html` / `?checkout=cancel`）は、購入ボタンを押したページのオリジンが
  `ALLOWED_ORIGINS` に含まれていればそこへ、含まれていなければ `SITE_URL` になります。
- シークレットをシェル履歴に残したくない場合は、ダッシュボード → Edge Functions → Secrets から入力しても同じです。
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は自動で渡されるため設定不要です。
- `ALERT_WEBHOOK_URL` は任意です。`{"text": "..."}` を POST できる URL（Slack 互換）を指定します。
  未設定の場合、チャージバックは `stripe-webhook` の Logs に `[DECIDE] チャージバック…` として出るだけです。
  Stripe 自体もチャージバック発生時にアカウントのメールへ通知します。

## 5. テスト購入

1. `https://decisionprocess.net`（またはローカル `http://localhost:8080`）で Google ログインする。
2. 無料枠を使い切って表示される購入案内（または設定の「ログの同期」をONにしようとしたときの案内）で「¥980で手に入れる」を押す → Stripe Checkout に移動する。
3. テストカードで支払う：
   - カード番号 `4242 4242 4242 4242`
   - 有効期限：未来の任意の日付（例 `12/34`）／ CVC：任意の3桁／ 名前・メール：任意
4. `success.html` に戻り「購入を反映しています…」→「UNLIMITED EDITIONが有効になりました。…」と表示されることを確認。
5. Supabase → Table Editor → `profiles` で自分の行が `plan_type = lifetime`、`pro_since` に日時が入っていることを確認。
6. アプリに戻り、無料枠の制限が外れていることを確認。もう一度購入ボタンを押すと「すでに購入済みです」になる。

うまくいかないとき：

- Stripe → Webhook → 該当エンドポイント → イベント の配信結果を見る（400 は署名不一致 = `STRIPE_WEBHOOK_SECRET` の誤り）。
- Supabase → Edge Functions → `stripe-webhook` / `create-checkout` → Logs を見る。
- 401 が出る場合は `stripe-webhook` を `--no-verify-jwt` 付きで再デプロイ。
- `success.html` で「時間がかかっています」になっても、Webhook が後から届けば UNLIMITED EDITION になります（アプリ再起動で反映）。

キャンセルの確認：Checkout 画面の「←戻る」で戻ると、アプリに「購入をキャンセルしました」と表示され、URL から `?checkout=cancel` が消えます。

## 6. 返金の確認

1. Stripe → 支払い → 該当の支払い →「返金」で **全額** 返金する。
2. `profiles.plan_type` が `free` に戻ることを確認（一部返金では UNLIMITED EDITION のままです）。
3. アプリ側は次回起動時（またはプラン再確認時）に無料表示へ戻ります。

## 6-2. チャージバック（不審請求の申し立て）が来たとき

チャージバックが起きても **UNLIMITED EDITION は自動では外しません**（誤解や家族のカード利用などで、後から取り下げられることもあるため）。
記録と通知だけを行うので、対応は運用で判断します。

1. 通知（または Stripe からのメール）を受けたら、Supabase → SQL Editor で記録を確認する：
   ```sql
   select * from stripe_disputes order by created_at desc;
   ```
   `user_id` が空の場合は、購入者を特定できなかった（DECIDE 以外の決済など）ということです。
2. Stripe → 支払い → 不審請求の申し立て で、期限までに証拠を提出するか、受け入れるかを決める。
3. UNLIMITED EDITION を外すと決めた場合（不正利用が明らかなとき・敗訴（`lost`）したときなど）は、手で更新する：
   ```sql
   update profiles set plan_type = 'free', pro_since = null where id = '<user_id>';
   ```
4. 決着すると `charge.dispute.closed` が届き、`stripe_disputes.status` が `won` / `lost` などに更新されます。

テストモードでは、カード番号 `4000 0000 0000 0259` で購入すると自動でチャージバックが発生し、上記の流れを確認できます。

## 7. 法務ページの記入（公開前に必須）

`dist/` の次の【要記入】【要確認】を埋めます。埋めたら `dist/service-worker.js` の `SHELL_CACHE` を1つ上げてください。

- `dist/tokushoho.html`（特定商取引法に基づく表記）
  - 販売業者（氏名または事業者名）／運営責任者／所在地／電話番号
  - 返品・キャンセルの【要確認：返金方針】（現状の文面で良ければ【要確認】の表示だけ削除）
- `dist/terms.html`（利用規約）
  - 運営者名／管轄裁判所

個人事業主の場合、住所・電話番号は「請求があれば遅滞なく開示」とする書き方を採っています（文面は記入済み）。

## 8. 本番（ライブモード）への切り替え

1. Stripe ダッシュボードで本番利用の申請（事業者情報・口座）を完了する。
   特商法表記の URL として `https://decisionprocess.net/tokushoho.html` を登録する。
2. テストモードをオフにし、ライブのシークレットキー（`sk_live_...`）を控える。
3. ライブモードで手順3と同じ Webhook エンドポイントを **もう一度** 作成し、ライブ用の `whsec_...` を控える
   （テストとライブで署名シークレットは別です）。
4. Secrets を差し替える：
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxxxxx
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
   ```
   Secrets の変更は再デプロイなしで反映されます（反映されない場合は手順2のデプロイをやり直す）。
5. 本番で実際に1回購入し、手順5の 4〜6 を確認 → 手順6の方法で全額返金して `free` に戻ることも確認。
6. `ALLOWED_ORIGINS` から `http://localhost:8080` を外す場合は、`supabase secrets set ALLOWED_ORIGINS=https://decisionprocess.net`。
