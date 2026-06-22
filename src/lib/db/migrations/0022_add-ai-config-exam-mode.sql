-- v2.5.0: optional AI co-pilot config + Exam Mode (both opt-in, default OFF).
--
-- AI is disabled by default. When enabled it defaults to a LOCAL provider
-- (Ollama) so no scan data leaves the host unless the operator explicitly
-- configures a cloud provider. The API key is stored server-side only and is
-- never returned to the client (the app-state-repo resolves it; routes read it
-- behind `server-only`).
--
-- Exam Mode is a hard override: when on, the AI assistant is forced off
-- regardless of ai_enabled (OSCP and similar exams forbid AI tools). It does
-- NOT touch any other network feature — internet research / HackTricks stay
-- available, since those are permitted during the exam.

ALTER TABLE app_state ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE app_state ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'ollama';
--> statement-breakpoint
ALTER TABLE app_state ADD COLUMN ai_base_url TEXT;
--> statement-breakpoint
ALTER TABLE app_state ADD COLUMN ai_model TEXT;
--> statement-breakpoint
ALTER TABLE app_state ADD COLUMN ai_api_key TEXT;
--> statement-breakpoint
ALTER TABLE app_state ADD COLUMN exam_mode INTEGER NOT NULL DEFAULT 0;
