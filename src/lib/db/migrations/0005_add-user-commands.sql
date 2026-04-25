-- Personal command library — pentester's own snippets that surface alongside
-- the shipped KB commands at render time.
--
-- Scope keys: `service` and `port` (both nullable):
--   - service set, port null  → matches every port with that service
--   - port set, service null  → matches every port with that number
--   - both set                → strictest match wins
--   - both null               → global command (shows for every port)
--
-- The matcher (lib/kb/user-commands.ts) merges these with the shipped KB
-- entry's commands list, preserving the existing `interpolateCommand`
-- pipeline so {IP}/{PORT}/{HOST} placeholders just work.
CREATE TABLE user_commands (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  service    TEXT,
  port       INTEGER,
  label      TEXT NOT NULL,
  template   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX user_commands_service_idx ON user_commands (service);
--> statement-breakpoint
CREATE INDEX user_commands_port_idx    ON user_commands (port);
