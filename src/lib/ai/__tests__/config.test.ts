import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/helpers/db.js";
import { setAppState } from "../../db/app-state-repo.js";
import {
  effectiveAiConfig,
  publicAiStatus,
  normalizeProvider,
  AI_PROVIDERS,
} from "../config.js";

const AI_ENV = [
  "RECON_AI_ENABLED",
  "RECON_AI_BASE_URL",
  "RECON_AI_MODEL",
  "RECON_AI_API_KEY",
  "RECON_EXAM_MODE",
];

describe("ai/config (v2.5.0 AI co-pilot resolver)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    for (const k of AI_ENV) delete process.env[k];
  });
  afterEach(() => {
    for (const k of AI_ENV) delete process.env[k];
  });

  it("fresh install: disabled, local provider default, no key", () => {
    const c = effectiveAiConfig(db);
    expect(c.enabled).toBe(false);
    expect(c.reason).toBe("disabled");
    expect(c.examMode).toBe(false);
    expect(c.provider).toBe("ollama");
    expect(c.cloud).toBe(false);
    expect(c.baseUrl).toBe(AI_PROVIDERS.ollama.defaultBaseUrl);
    expect(c.model).toBe(AI_PROVIDERS.ollama.defaultModel);
    expect(c.hasKey).toBe(false);
  });

  it("enabling a local provider needs no key", () => {
    setAppState(db, { ai_enabled: true });
    const c = effectiveAiConfig(db);
    expect(c.enabled).toBe(true);
    expect(c.reason).toBeNull();
  });

  it("exam mode is a hard override even when AI is enabled", () => {
    setAppState(db, { ai_enabled: true, exam_mode: true });
    const c = effectiveAiConfig(db);
    expect(c.enabled).toBe(false);
    expect(c.reason).toBe("exam_mode");
    expect(c.examMode).toBe(true);
  });

  it("cloud provider without a key is disabled (missing_key)", () => {
    setAppState(db, { ai_enabled: true, ai_provider: "openai" });
    const c = effectiveAiConfig(db);
    expect(c.enabled).toBe(false);
    expect(c.reason).toBe("missing_key");
    expect(c.cloud).toBe(true);
    expect(c.baseUrl).toBe(AI_PROVIDERS.openai.defaultBaseUrl);
    expect(c.model).toBe(AI_PROVIDERS.openai.defaultModel);
  });

  it("cloud provider with a key is enabled", () => {
    setAppState(db, {
      ai_enabled: true,
      ai_provider: "openrouter",
      ai_api_key: "sk-test-123",
    });
    const c = effectiveAiConfig(db);
    expect(c.enabled).toBe(true);
    expect(c.reason).toBeNull();
    expect(c.hasKey).toBe(true);
    expect(c.apiKey).toBe("sk-test-123");
  });

  it("explicit base URL and model override the provider preset", () => {
    setAppState(db, {
      ai_enabled: true,
      ai_provider: "ollama",
      ai_base_url: "http://127.0.0.1:1234/v1",
      ai_model: "qwen2.5-coder",
    });
    const c = effectiveAiConfig(db);
    expect(c.baseUrl).toBe("http://127.0.0.1:1234/v1");
    expect(c.model).toBe("qwen2.5-coder");
  });

  it("unknown provider value falls back to local ollama", () => {
    expect(normalizeProvider("totally-bogus")).toBe("ollama");
    setAppState(db, { ai_enabled: true, ai_provider: "totally-bogus" });
    expect(effectiveAiConfig(db).provider).toBe("ollama");
  });

  it("publicAiStatus never exposes the API key", () => {
    setAppState(db, {
      ai_enabled: true,
      ai_provider: "openai",
      ai_api_key: "sk-secret",
    });
    const status = publicAiStatus(db);
    expect(status.hasKey).toBe(true);
    expect(JSON.stringify(status)).not.toContain("sk-secret");
    expect("apiKey" in status).toBe(false);
    expect("baseUrl" in status).toBe(false);
  });

  it("env fallback can enable AI and exam mode forces it off", () => {
    process.env.RECON_AI_ENABLED = "1";
    expect(effectiveAiConfig(db).enabled).toBe(true);
    process.env.RECON_EXAM_MODE = "1";
    const c = effectiveAiConfig(db);
    expect(c.enabled).toBe(false);
    expect(c.reason).toBe("exam_mode");
  });
});
