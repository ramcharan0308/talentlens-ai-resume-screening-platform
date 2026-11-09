import { ScreeningProvider } from "./types";
import { MockScreeningProvider } from "./mock-provider";
import { OpenAIScreeningProvider } from "./openai-provider";

/**
 * Returns the configured screening provider.
 *
 * SAFETY INVARIANTS:
 * 1. Production must NEVER silently fall back to the mock provider.
 * 2. Mock provider is restricted to test environments or explicit local development.
 * 3. In production, missing OPENAI_API_KEY throws an explicit AI_PROVIDER_NOT_CONFIGURED error.
 * 4. In tests and offline development without an API key, safely defaults to MockScreeningProvider.
 */
export function getScreeningProvider(overrideProvider?: string): ScreeningProvider {
  const isProd = process.env.NODE_ENV === "production";
  const explicitProvider = overrideProvider || process.env.SCREENING_PROVIDER;

  // SAFETY INVARIANT: Mock provider is strictly prohibited in production under ALL circumstances.
  // There is NO escape hatch (ALLOW_MOCK_IN_PRODUCTION is removed; mock provider never runs in production).
  if (isProd) {
    if (explicitProvider?.toLowerCase() === "mock") {
      throw new Error(
        "AI_PROVIDER_NOT_CONFIGURED: Mock provider is strictly prohibited in production environments."
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "AI_PROVIDER_NOT_CONFIGURED: OPENAI_API_KEY environment variable is missing in production."
      );
    }
    return new OpenAIScreeningProvider();
  }

  // 1. Explicitly requested mock provider (non-production only)
  if (explicitProvider?.toLowerCase() === "mock") {
    return new MockScreeningProvider();
  }

  // 2. Explicitly requested openai provider without key
  if (overrideProvider?.toLowerCase() === "openai" && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "AI_PROVIDER_NOT_CONFIGURED: OpenAI API key is missing. Set OPENAI_API_KEY in environment."
    );
  }

  // 3. Non-production (test/development):
  // If OPENAI_API_KEY is configured and no mock requested, use OpenAI
  if (process.env.OPENAI_API_KEY && !explicitProvider) {
    return new OpenAIScreeningProvider();
  }

  // 4. Non-production offline/test default
  return new MockScreeningProvider();
}
