ALTER TABLE check_configs ADD COLUMN api_format TEXT NOT NULL DEFAULT 'chat_completions'
  CHECK (api_format IN ('chat_completions', 'responses'));

UPDATE check_configs
SET api_format = 'responses'
WHERE endpoint LIKE '%/responses';
