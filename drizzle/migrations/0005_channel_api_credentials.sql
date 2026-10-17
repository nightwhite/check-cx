ALTER TABLE channels ADD COLUMN base_url TEXT;
ALTER TABLE channels ADD COLUMN api_key_ciphertext TEXT;
ALTER TABLE channels ADD COLUMN api_key_nonce TEXT;
ALTER TABLE channels ADD COLUMN api_key_version INTEGER NOT NULL DEFAULT 1;
