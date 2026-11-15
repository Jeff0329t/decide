-- 顔の家（FACE HOUSE KYOTO）の紹介先マスタ登録
-- 前提: 20261116000000_partner_referrals.sql を適用済みであること。ダッシュボードのSQLエディタで実行する。
-- 店舗用URL／QR: https://decisionprocess.net/en/?via=facehouse
--
-- 注意: 通知先メールアドレスは未入手のため email は null で登録する。
-- フェーズ2（日次通知）の運用開始までに、店舗へ確認したアドレスで下の update を実行すること。
--   update public.partner_channels set email = '<店舗の通知先メール>' where code = 'facehouse';

insert into public.partner_channels (code, name, email, reward_jpy, active)
values ('facehouse', '顔の家', null, 200, true)
on conflict (code) do nothing;

-- 登録できたことの確認（1行返ればよい）
select code, name, email, reward_jpy, active from public.partner_channels where code = 'facehouse';
