import { ScreeningProvider } from "./types";
import { MockScreeningProvider } from "./mock-provider";
import { OpenAIScreeningProvider } from "./openai-provider";
import { GroqScreeningProvider } from "./groq-provider";

/**
 * Returns the configured screening provider.
 *
 * SAFETY INVARIANTS:
 * 1. Production must NEVER silently fall back to the mock provider.
 * 2. Mock provider is restricted to test environments or explicit local development.
 * 3. Groq is prioritized as the primary zero-cost free-tier provider (using GROQ_API_KEY).
 * 4. OpenAI is supported as a configurable fallback or explicit alternative (using OPENAI_API_KEY).
 * 5. When Groq is selected, there is NO runtime dependency on OpenAI credentials.
 * 6. In production, missing credentials throw an explicit AI_PROVIDER_NOT_CONFIGURED error.
 * 7. In tests and offline development without an API key, safely defaults to MockScreeningProvider.
 */
export function getScreeningProvider(overrideProvider?: string): ScreeningProvider {
  const isProd = process.env.NODE_ENV === "production";
  const explicitProvider = (overrideProvider || process.env.SCREENING_PROVIDER || "").trim().toLowerCase();

  // SAFETY INVARIANT: Mock provider is strictly prohibited in production under ALL circumstances.
  if (isProd && explicitProvider === "mock") {
    throw new Error(
      "AI_PROVIDER_NOT_CONFIGURED: Mock provider is strictly prohibited in production environments."
    );
  }

  // 1. Explicitly requested mock provider (non-production only)
  if (explicitProvider === "mock") {
    return new MockScreeningProvider();
  }

  // 2. Explicitly requested groq provider
  if (explicitProvider === "groq") {
    if (!process.env.GROQ_API_KEY) {
      throw new Error(
        "AI_PROVIDER_NOT_CONFIGURED: Groq API key is missing. Set GROQ_API_KEY in environment."
      );
    }
    return new GroqScreeningProvider();
  }

  // 3. Explicitly requested openai provider
  if (explicitProvider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "AI_PROVIDER_NOT_CONFIGURED: OpenAI API key is missing. Set OPENAI_API_KEY in environment."
      );
    }
    return new OpenAIScreeningProvider();
  }

  // 4. If an unsupported explicit provider was specified
  if (explicitProvider) {
    throw new Error(
      `AI_PROVIDER_NOT_CONFIGURED: Unsupported screening provider "${explicitProvider}". Supported providers: "groq", "openai", "mock".`
    );
  }

  // 5. Automatic Provider Resolution (when no provider is explicitly requested)
  // Priority 1: Groq (free-tier optimized)
  if (process.env.GROQ_API_KEY) {
    return new GroqScreeningProvider();
  }

  // Priority 2: OpenAI
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIScreeningProvider();
  }

  // 6. Production check: If neither key is configured in production, fail explicitly
  if (isProd) {
    throw new Error(
      "AI_PROVIDER_NOT_CONFIGURED: GROQ_API_KEY (or OPENAI_API_KEY) environment variable is missing in production."
    );
  }

  // 7. Non-production offline/test default
  return new MockScreeningProvider();
}
