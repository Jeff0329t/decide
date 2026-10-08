# ログイン（Google / Supabase）セットアップ手順

Phase 1 で追加したログイン機能を有効にするための、人間が行う設定作業です。
`dist/config.js` が空のままならログイン機能は表示されず、従来どおりログインなしで動きます。

> 重要：フロント（`dist/`）に置いてよいのは **Supabase の URL と anon（public）キーだけ** です。
> `service_role` キー・Stripe シークレットキー・Webhook 秘密は絶対に `dist/` に書かないでください。

## 1. Supabase プロジェクト作成

1. https://supabase.com でプロジェクトを作成（リージョンは Tokyo 推奨）。
2. Project Settings → API で次を控える：
   - Project URL（例 `https://xxxx.supabase.co`）
   - `anon` `public` キー

## 2. Google Cloud で OAuth クライアントを作成

1. https://console.cloud.google.com で新規プロジェクトを作成。
2. 「API とサービス」→「OAuth 同意画面」
   - User Type：外部
   - アプリ名：DECIDE.／サポートメール：運営者のメール
   - 承認済みドメイン：`decisionprocess.net` のみ
     （`supabase.co` は公開サフィックスのため登録できず「最上位のプライベート ドメインを指定する必要があります」になる。登録しなくてもリダイレクト URI は動く）
   - プライバシーポリシー URL：`https://decisionprocess.net/privacy.html`
   - スコープ：`email` `profile` `openid` のみ
   - 公開ステータスを「本番環境」にする（テスト中はテストユーザーしかログインできません）
3. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
   - 種類：ウェブアプリケーション
   - 承認済みの JavaScript 生成元：`https://decisionprocess.net`、`http://localhost`、`http://localhost:4173`、`http://localhost:8080`、`http://localhost:8765`（localhost はローカル確認用。Google ボタン方式ではこの生成元が一致しないとボタンが出ません）
   - 承認済みのリダイレクト URI：`https://<プロジェクトID>.supabase.co/auth/v1/callback`（`GOOGLE_CLIENT_ID` 未設定時のリダイレクト方式＝フォールバック用。残しておく）
4. 表示されたクライアント ID とクライアントシークレットを控える。

## 3. Supabase で Google プロバイダを有効化

1. Authentication → Sign In / Providers → Google を有効化。
2. 手順2のクライアント ID / シークレットを貼り付けて保存（シークレットはフォールバックのリダイレクト方式で使うので消さない）。
3. 「Client IDs」（承認済みクライアントID）欄にも同じクライアント ID を入れる。`signInWithIdToken` で受け取る IDトークンの `aud` がここと一致しないと拒否されます。
4. 「Skip nonce check」は OFF のまま。フロントは生の nonce を Supabase に、SHA-256 ハッシュを Google に渡して照合させています。

> ログインは Google Identity Services（GIS）のボタン → `signInWithIdToken` 方式です。Google の同意画面には `supabase.co` ではなく `decisionprocess.net`（アプリ名）が表示されます。

## 4. Site URL とリダイレクト URL

Authentication → URL Configuration：

- Site URL：`https://decisionprocess.net`
- Redirect URLs（追加）：
  - `https://decisionprocess.net/**`
  - `https://*.<Pagesプロジェクト名>.pages.dev/**`（Cloudflare Pages のプレビュー用）
  - `http://localhost:8080/**`（ローカル確認用。使うポートに合わせる）

## 5. データベース（マイグレーション）

どちらかの方法で `supabase/migrations/20261005000000_billing.sql` を適用します。

- SQL Editor：ファイルの中身を貼り付けて Run。
- CLI：
  ```bash
  supabase link --project-ref <プロジェクトID>
  supabase db push
  ```

作成されるもの：`profiles`（本人のみ SELECT 可・クライアントからの書き込み不可）、`stripe_events`、サインアップ時に `profiles` 行を作るトリガー、`record_draw()` / `merge_local_draws()`。

## 6. アカウント削除の Edge Function

Supabase CLI が未インストールなら先に入れます（`command not found: supabase` が出た場合）。
コマンドは必ず `app` フォルダ（`supabase/` がある場所）で実行してください。

```bash
brew install supabase/tap/supabase
cd "/Users/wajikitoru/DECIDE 開発用2/app"
supabase login
supabase link --project-ref <プロジェクトID>
```

CLI を使わない場合は、ダッシュボード → Edge Functions → 「Deploy a new function」→「Via Editor」で、
名前を `delete-account` にして `supabase/functions/delete-account/index.ts` の中身を貼り付けて Deploy し、
Edge Functions → Secrets で下の2つ（`SITE_URL` / `ALLOWED_ORIGINS`）を追加しても同じです。

```bash
supabase functions deploy delete-account
supabase secrets set SITE_URL=https://decisionprocess.net
supabase secrets set ALLOWED_ORIGINS=https://decisionprocess.net,http://localhost:8080
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Edge Function に自動で渡されるため設定不要です（service_role はサーバー側だけで使われます）。

## 7. フロントの設定

`dist/config.js` に URL・anon キー・Google クライアント ID（いずれも公開してよい値）だけを書きます。`.env.example` の `NEXT_PUBLIC_GOOGLE_CLIENT_ID` は同じ値の控えで、静的サイトなので実際に読まれるのは `config.js` です。

```js
window.DECIDE_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...（anon public キー）',
  SITE_URL: 'https://decisionprocess.net',
  // 空なら従来の signInWithOAuth リダイレクト方式
  GOOGLE_CLIENT_ID: 'xxxx.apps.googleusercontent.com'
});
```

変更したら `dist/service-worker.js` の `SHELL_CACHE` を1つ上げてからデプロイしてください。

## 8. 無料枠と PRO 判定（Phase 2）

- 無料枠: ドロー累計 **10回**、ログ保存 **10件**（SOLO・DUEL 共通）。判定は `dist/entitlements.js` の `canDraw()` / `canSaveLog(件数)` / `hasProAccess(user)`。
- ドロー回数は端末内（`decide.tarot.entitlements.v1`）でカウントし、ログイン済みなら `profiles.draw_count` にも反映します（RPC `record_draw`）。ログイン時は端末内とDBの **大きい方** を採用します（RPC `merge_local_draws`、加算はしません）。
- ログを削除してもドロー回数は戻りません。ログ件数は「現在の保存件数」で数えます。10件を超える既存ログは閲覧でき、新規保存のみ制限されます。
- PRO 判定は `profiles.plan_type` が `'free'` 以外であること。ログイン時にサーバーから取得して `decide.tarot.entitlements.v1` にキャッシュし、オフライン時は直近のキャッシュ値を使います（キャッシュは同じユーザーIDの場合のみ有効）。
- 11回目のドロー / 11件目の保存の直前に PRO 案内モーダルを表示して操作をブロックします。未ログインなら先に Google ログイン → ログイン後に購入へ進みます（購入ボタンは Phase 3 で Stripe に接続）。
- **既知の制約**: 無料枠のドロー回数・ログ件数は端末内判定のため、技術に詳しい人は回避可能です（許容）。サーバーで確実に守るのは PRO 判定のみです。
- 動作確認時に無料枠をリセットしたい場合は、ブラウザのコンソールで `localStorage.removeItem('decide.tarot.entitlements.v1')` を実行します（ログイン中は DB の `draw_count` も Supabase の Table Editor で戻してください）。
