// DECIDE. 公開設定（フロントに置いてよい値だけ）
// SUPABASE_ANON_KEY は公開前提のキー。service_role・Stripeシークレット・Webhook秘密は絶対にここへ書かない。
// 値が空のあいだはログイン機能が無効になり、ログアウト状態のまま従来どおり使えます。
window.DECIDE_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://ppuyenvuepxqqrhiswwb.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwdXllbnZ1ZXB4cXFyaGlzd3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjg4MDIsImV4cCI6MjEwNjgwNDgwMn0.NvbyTthzp3ELRJyI-PXO0ZTGhzfpjd7E5JTL1rujbI4',
  SITE_URL: 'https://decisionprocess.net',
  // Google OAuth（ウェブアプリ）のクライアントID（公開してよい値・NEXT_PUBLIC_GOOGLE_CLIENT_ID 相当）。空なら従来のリダイレクト方式でログイン
  GOOGLE_CLIENT_ID: '550943837124-b7cgk85t5jur9636uep91tulgvooco44.apps.googleusercontent.com',
  // プッシュ通知の VAPID 公開鍵（公開してよい値・ご自身で入力）。秘密鍵は絶対にここへ書かず、Supabase Secrets にだけ入れてください
  VAPID_PUBLIC_KEY: 'BOTkaKkZkR6JzmNzvu8teuVC0VHRHwmP76IUMnjOhVQUKjsR0wIFzi7qm0AagaDkU1lZK-CTBh5nR0NTSpYv0KQ'
});
