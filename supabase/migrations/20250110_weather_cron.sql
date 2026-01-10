-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing job if any
SELECT cron.unschedule('fetch-weather-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fetch-weather-daily'
);

-- Schedule weather fetch at 3am Central Time (9am UTC)
-- pg_cron uses UTC, so 3am CST = 9am UTC (standard time)
-- During CDT (daylight), 3am CDT = 8am UTC
SELECT cron.schedule(
  'fetch-weather-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fnlziotsonylhsrxydci.supabase.co/functions/v1/fetch-weather?run=true',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubHppb3Rzb255bGhzcnh5ZGNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDM4NzksImV4cCI6MjA4MjY3OTg3OX0.m_VzRn_1F_T8yjX2fYTl9lKTg8rr30sBNa6hDaEMq6U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'fetch-weather-daily';
