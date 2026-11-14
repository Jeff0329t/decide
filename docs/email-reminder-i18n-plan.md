# 振り返りリマインドメールの英語化 — 調査と実装計画

作成: 2026-11-15（調査のみ。本番DBの変更・デプロイは未実施）

## 現状

### 文言はどこにあるか
- 件名・本文は **DB関数 `public.email_reminder_digest_payload_`**（`supabase/migrations/20261110000000_email_reminder_digest.sql`）が生成する。日本語のみ。
- パターンは4つ: C=複数件のまとめ、D=一度送った決断の再通知、B=先の日付に設定した決断、A=標準。共通フッター（配信停止リンク付き）。
- 生成された payload（`{from, to, subject, text}`）は `email_reminder_deliveries.payload` に保存され、送信直前（reserve）にも再構築される。
- Edge Function `send-email-reminders` は橋渡しのみ（claim / reserve / complete）。Apps Script（`google-apps-script/Code.gs`）は payload の subject / text をそのまま MailApp で送る。**どちらも文言を持たない。**
- Apps Script の接続テストメール（`sendTestEmail`）は運用者宛てで、利用者には送られない。英語化の対象外。

### 利用者の言語はサーバーに届いているか
- **届いていない（確定）。** 言語は端末の localStorage `decide.lang.v1` にのみあり、`dist/i18n.js` が端末内で完結している。
- アプリ→サーバーの同期は RPC `set_email_reminders(device, enabled, items)`（`dist/email-reminders.js` から呼び出し）で、引数に言語はない。
- `email_reminder_devices` テーブルは `(user_id, device_id, enabled)` のみで言語列なし。マイグレーション全体にも言語を表す列はない。

## 英語メールに必要な変更

### 1. DBマイグレーション（本番作業・要承認）
1. `email_reminder_devices` に列追加:
   - `lang text not null default 'ja'`（`check (lang in ('ja','en'))`）
   - `updated_at timestamptz not null default now()`（複数端末で言語が食い違うときの決定用）
2. `set_email_reminders` に `lang` 引数を追加した4引数版を新設（3引数版は残す。`lang` が null のときは既存値を保持し、値があるときだけ更新＋ `updated_at` を進める）。
3. `email_reminder_digest_payload_` に `lang` 引数を追加:
   - `ja` の分岐は現行の式を**一切変更しない**（そのまま温存）。
   - `en` の分岐だけを新規追加（テンプレートは本書末尾）。
4. `claim_email_reminders`: 配信対象ユーザーの言語を決定して payload 生成に渡す。規則は「そのユーザーの enabled なデバイスのうち `updated_at` が最新の行の `lang`」。決まらない場合は `ja`。

### 2. アプリ（追加オーバーレイ方式の範囲内）
- `dist/email-reminders.js`: `set_email_reminders` の全呼び出しに、現在のUI言語（`window.DECIDE_I18N.locale()`）を `lang` として含める。
- 言語切替（設定→再読み込み）の後、メール設定の同期が走るタイミングで新しい言語が送られることを確認する。確実にするため、言語切替の保存時にも同期を1回呼ぶ。
- 日本語利用者は `ja` が送られるだけで、届くメールは従来どおり。

### 3. 変更不要
- Edge Function `send-email-reminders`、Apps Script `Code.gs`（payload を運ぶだけ）。
- プッシュ通知（`send-reminders`）や決済関連メールは対象外・無変更。

### 4. 検証
- `scripts/verify-email-reminder-digest-db.mjs` に `en` のケースを追加（4パターン＋フッター）。
- **日本語の回帰確認**: 移行前に代表ケース（A/B/C/D）の ja payload を保存し、移行後にバイト単位で同一であることを比較する。
- アプリ側テスト（`tests/`）に、同期RPCへ `lang` が含まれることの確認を追加。

## 実施手順（順序が重要）
1. DBマイグレーションを適用（列は既定 `ja` なので、この時点では全員のメールは従来どおり）。
2. ja payload の回帰確認（バイト同一）。
3. アプリ側の変更を公開（`lang` 同期開始）。旧アプリ＋新DBでも動作する（4引数版は追加であり置換ではない）。
4. 英語モードのテスト端末で、19時のまとめ配信が英語で届くことを実機確認。
5. 異常時はアプリ側だけ戻せば全員 `ja` のままになる（DBの追加列は無害）。

## 日本語利用者のメールが変わらない担保
- 既定値 `ja`。英語になるのは、英語モードのアプリが明示的に `lang='en'` を同期したユーザーだけ。
- ja 分岐のSQL式は変更せず、分岐の追加のみ。
- payload の形（`{from, to, subject, text}`）は変えないので、橋渡しと送信側は無変更。

## 注意（仕様として確定しておく点）
- 件名・本文に差し込まれる「決断の題名」は利用者の記録そのものなので翻訳しない。日本語で付けた題名は、英語メールでも日本語のまま入る。

---

## 英語テンプレート案（`email_reminder_digest_payload_` の en 分岐用）

プレースホルダ: `{n}`=件数、`{title}`=先頭の決断の題名（空のときの代替は `a recorded decision`）、`{site}`=サイトURL、`{unsubscribe}`=配信停止URL。

### パターンC（複数件）
- 件名: `DECIDE. | You have {n} decisions to look back on today`
- 本文:
```
Another day done.
The day has come to look back on {n} decisions.

• "{title1}"
• "{title2}"

How did it go? Whether it went well or differently than you expected, a few words are enough.
If there's one you haven't acted on yet, "not yet" is also a record of where you are now.
You don't have to do all of them — start with just one that catches your eye.

[long の決断がある場合] For a decision you planned to take time with, you can record how it feels partway through, even before the outcome is clear.

[repeat の決断がある場合] This includes a decision we reminded you about once before. Start with whichever you like.

Open DECIDE. and add "how it went" from your history:
{site}
```

### パターンD（一度送った決断の再通知）
- 件名: `DECIDE. | A look-back is still waiting for "{title}"`
- 本文:
```
"{title}" is a decision we reminded you about once before. You chose a new day to look back on it, and today is that day.

Whenever you feel like it is fine. Even a few words — record how it feels now.
And it's fine if you're not there yet. "Not yet" is also a record of where you are now.

If you no longer need reminders about this decision, add a look-back from the app's history, or remove the day.

Open DECIDE. and add "how it went" for this record from your history:
{site}
```

### パターンB（先の日付に設定した決断）
- 件名: `DECIDE. | "{title}" — how has it gone since then?`
- 本文:
```
You set "{title}" to look back on a little further ahead.

With time having passed, has anything changed — in your situation, or in how you feel?
Even if there's no outcome yet, how it feels partway through is also a record.
Even a few words, compared with how you felt when you decided.

Recording how it feels now gives you your own experience to draw on the next time you face a similar choice.

Open DECIDE. and add "how it went" for this record from your history:
{site}
```

### パターンA（標準）
- 件名: `DECIDE. | Look back on "{title}"?`（題名なし: `DECIDE. | Look back on a decision you recorded?`）
- 本文:
```
You set today as the day to look back on "{title}".

How did it go? Has how you feel changed since you decided?
Whether it went well or differently than you expected, a few words are enough.
If you haven't acted on it yet, "not yet" is also a record of where you are now.

Recording how it feels now gives you your own experience to draw on the next time you face a similar choice.

Open DECIDE. and add "how it went" for this record from your history:
{site}
```

### 共通フッター
```
You're receiving this email because you turned on "Email reminders" in DECIDE.
Stop reminder emails (all devices):
{unsubscribe}
You can also stop them from the "Email reminders" setting in the app.
```
