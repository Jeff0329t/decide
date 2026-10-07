-- DECIDE: プッシュ通知を15分ごとに送る設定（見本）
-- このファイルはそのまま実行しません。Supabase の SQL Editor に貼り、
-- <PROJECT_REF> と <CRON_SECRET> を自分で書きかえてから実行してください。
-- （<CRON_SECRET> は Supabase Secrets に入れた CRON_SECRET と同じ値。このファイルやGitには書かないでください）

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 同じ名前の予定があれば消してから作り直す
select cron.unschedule('decide-send-reminders')
where exists (select 1 from cron.job where jobname = 'decide-send-reminders');

select cron.schedule(
  'decide-send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
