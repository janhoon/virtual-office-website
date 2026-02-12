CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  subscribed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_subscribed_at ON waitlist(subscribed_at);
