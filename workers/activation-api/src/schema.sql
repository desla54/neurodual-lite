-- Activation codes generated after successful payment
CREATE TABLE IF NOT EXISTS codes (
  code TEXT PRIMARY KEY,
  source TEXT NOT NULL,          -- 'google' | 'apple' | 'lemon'
  source_order_id TEXT,          -- original order/transaction ID
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Device activations (max 3 per code)
CREATE TABLE IF NOT EXISTS activations (
  code TEXT NOT NULL REFERENCES codes(code),
  device_id TEXT NOT NULL,
  device_name TEXT,              -- optional friendly name
  activated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (code, device_id)
);

CREATE INDEX IF NOT EXISTS idx_activations_code ON activations(code);
CREATE INDEX IF NOT EXISTS idx_activations_device ON activations(device_id);
