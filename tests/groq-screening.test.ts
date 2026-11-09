import test from "node:test";
import assert from "node:assert/strict";
import {
  GroqScreeningProvider,
  getScreeningProvider,
  ScreeningProvider,
  ProviderEvaluationRequest,
} from "../src/lib/screening";

test("GroqScreeningProvider: Instantiation without GROQ_API_KEY throws AI_PROVIDER_NOT_CONFIGURED", () => {
  const originalKey = process.env.GROQ_API_KEY;
  try {
    delete process.env.GROQ_API_KEY;
    assert.throws(
      () => new GroqScreeningProvider(),
      (err: any) =>
        err.message.includes("AI_PROVIDER_NOT_CONFIGURED") &&
        err.message.includes("Groq API key is missing")
    );
  } finally {
    if (originalKey) process.env.GROQ_API_KEY = originalKey;
  }
});

test("GroqScreeningProvider: Instantiation with defaults sets openai/gpt-oss-120b and https://api.groq.com/openai/v1", () => {
  const provider = new GroqScreeningProvider("gsk_test_dummy_key_12345");
  assert.equal(provider.id, "groq");
  assert.equal(provider.modelId, "openai/gpt-oss-120b");
});

test("GroqScreeningProvider: GROQ_MODEL environment variable overrides default model", () => {
  const originalModel = process.env.GROQ_MODEL;
  try {
    process.env.GROQ_MODEL = "custom/override-model-70b";
    const provider = new GroqScreeningProvider("gsk_test_dummy_key_12345");
    assert.equal(provider.modelId, "custom/override-model-70b");
  } finally {
    if (originalModel) process.env.GROQ_MODEL = originalModel;
    else delete process.env.GROQ_MODEL;
  }
});

test("GroqScreeningProvider: Custom model and base URL are respected via constructor", () => {
  const provider = new GroqScreeningProvider(
    "gsk_test_dummy_key_12345",
    "llama-3.1-8b-instant",
    "https://custom-proxy.internal/v1"
  );
  assert.equal(provider.modelId, "llama-3.1-8b-instant");
});

test("Groq Provider Resolution: SCREENING_PROVIDER='groq' instantiates Groq without requiring OPENAI_API_KEY", () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.SCREENING_PROVIDER;

  try {
    process.env.GROQ_API_KEY = "gsk_test_key_valid";
    delete process.env.OPENAI_API_KEY;
    process.env.SCREENING_PROVIDER = "groq";

    const provider = getScreeningProvider();
    assert.equal(provider.id, "groq");
    assert.equal(provider.modelId, "openai/gpt-oss-120b");
  } finally {
    if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey;
    else delete process.env.GROQ_API_KEY;
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalProvider) process.env.SCREENING_PROVIDER = originalProvider;
    else delete process.env.SCREENING_PROVIDER;
  }
});

test("Groq Provider Resolution: Prioritizes Groq when both GROQ_API_KEY and OPENAI_API_KEY are configured", () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.SCREENING_PROVIDER;

  try {
    process.env.GROQ_API_KEY = "gsk_test_groq";
    process.env.OPENAI_API_KEY = "sk-test-openai";
    delete process.env.SCREENING_PROVIDER;

    const provider = getScreeningProvider();
    assert.equal(provider.id, "groq", "Groq must be prioritized as the free-tier provider");
  } finally {
    if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey;
    else delete process.env.GROQ_API_KEY;
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalProvider) process.env.SCREENING_PROVIDER = originalProvider;
    else delete process.env.SCREENING_PROVIDER;
  }
});

test("Groq Provider Resolution: Explicit SCREENING_PROVIDER='openai' selects OpenAI without requiring GROQ_API_KEY", () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.SCREENING_PROVIDER;

  try {
    delete process.env.GROQ_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-valid-openai-key";
    process.env.SCREENING_PROVIDER = "openai";

    const provider = getScreeningProvider();
    assert.equal(provider.id, "openai");
  } finally {
    if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey;
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalProvider) process.env.SCREENING_PROVIDER = originalProvider;
    else delete process.env.SCREENING_PROVIDER;
  }
});

test("Groq Provider Resolution: In production, missing both keys throws explicit AI_PROVIDER_NOT_CONFIGURED", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.SCREENING_PROVIDER;

  try {
    (process.env as any).NODE_ENV = "production";
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.SCREENING_PROVIDER;

    assert.throws(
      () => getScreeningProvider(),
      (err: any) =>
        err.message.includes("AI_PROVIDER_NOT_CONFIGURED") &&
        err.message.includes("missing in production")
    );
  } finally {
    (process.env as any).NODE_ENV = originalEnv;
    if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey;
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalProvider) process.env.SCREENING_PROVIDER = originalProvider;
  }
});

test("Groq Provider Evaluation: Successfully parses completion, clamps scores, and preserves verbatim quotes", async () => {
  const originalFetch = globalThis.fetch;

  try {
    const mockApiResponse = {
      id: "chatcmpl-test-groq-01",
      object: "chat.completion",
      model: "openai/gpt-oss-120b",
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              criteria: [
                {
                  criterionName: "Java & Spring Boot Architecture",
                  score: 9,
                  status: "SUPPORTED",
                  explanation: "Candidate has 7 years of backend architecture experience.",
                  quotes: ["Architected microservices using Java 17 and Spring Boot 3"],
                  missingGaps: [],
                },
                {
                  criterionName: "Kafka Streaming",
                  score: 15, // Out of bounds -> should clamp to 10
                  status: "PARTIAL",
                  explanation: "Used Kafka for basic pub/sub events.",
                  quotes: ["Integrated Kafka event consumer"],
                  missingGaps: ["No experience with Kafka cluster operations"],
                },
                {
                  criterionName: "Kubernetes Cluster Administration",
                  score: -2, // Out of bounds -> should clamp to 1
                  status: "UNKNOWN_STATUS", // Invalid status -> should fallback to INSUFFICIENT
                  explanation: "No Kubernetes administration mentioned.",
                  quotes: [],
                  missingGaps: ["Missing K8s administration"],
                },
              ],
            }),
          },
        },
      ],
    };

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.ok(String(url).includes("/chat/completions"));
      assert.equal(init?.method, "POST");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer gsk_dummy_test_token");

      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "openai/gpt-oss-120b");
      assert.deepEqual(body.response_format, { type: "json_object" });

      return new Response(JSON.stringify(mockApiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    const provider = new GroqScreeningProvider("gsk_dummy_test_token");
    const sampleRequest: ProviderEvaluationRequest = {
      sanitizedResumeText: "Architected microservices using Java 17 and Spring Boot 3. Integrated Kafka event consumer.",
      jobDescription: "Senior Java Developer with Kafka and Kubernetes experience.",
      roleTitle: "Senior Java Developer",
      criteria: [
        { id: "c1", name: "Java & Spring Boot Architecture", weight: 50, isMustHave: true },
        { id: "c2", name: "Kafka Streaming", weight: 30, isMustHave: false },
        { id: "c3", name: "Kubernetes Cluster Administration", weight: 20, isMustHave: true },
      ],
    };

    const result = await provider.evaluate(sampleRequest);
    assert.equal(result.modelId, "openai/gpt-oss-120b");
    assert.equal(result.criteria.length, 3);

    // 1. First criterion
    assert.equal(result.criteria[0].criterionName, "Java & Spring Boot Architecture");
    assert.equal(result.criteria[0].score, 9);
    assert.equal(result.criteria[0].status, "SUPPORTED");
    assert.deepEqual(result.criteria[0].quotes, ["Architected microservices using Java 17 and Spring Boot 3"]);

    // 2. Clamped upper score
    assert.equal(result.criteria[1].score, 10, "Score > 10 must clamp to 10");
    assert.equal(result.criteria[1].status, "PARTIAL");

    // 3. Clamped lower score and status normalization
    assert.equal(result.criteria[2].score, 1, "Score < 1 must clamp to 1");
    assert.equal(result.criteria[2].status, "INSUFFICIENT", "Unknown status must fallback to INSUFFICIENT");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Groq Provider Error Handling: HTTP 429 triggers retry logic with backoff", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = (async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Rate limit reached for model openai/gpt-oss-120b",
              type: "tokens",
              code: "rate_limit_exceeded",
            },
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json", "retry-after": "0.1" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  criteria: [
                    {
                      criterionName: "Test Criterion",
                      score: 8,
                      status: "SUPPORTED",
                      explanation: "Succeeded on retry",
                      quotes: [],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const provider = new GroqScreeningProvider("gsk_dummy_test_token");
    const result = await provider.evaluate({
      sanitizedResumeText: "Sample resume text",
      jobDescription: "Sample JD",
      criteria: [{ id: "c1", name: "Test Criterion", weight: 100, isMustHave: false }],
    });

    assert.equal(attempts, 2, "Must retry on HTTP 429 rate limit");
    assert.equal(result.criteria[0].score, 8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Groq Provider Error Handling: Non-success HTTP 500 throws descriptive error without leaking resume text", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: { message: "Internal Groq LPU cluster error" },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const provider = new GroqScreeningProvider("gsk_dummy_test_token");
    await assert.rejects(
      () =>
        provider.evaluate({
          sanitizedResumeText: "Confidential private candidate resume text with trade secrets",
          jobDescription: "Sample JD",
          criteria: [{ id: "c1", name: "Test Criterion", weight: 100, isMustHave: false }],
        }),
      (err: any) => {
        assert.ok(err.message.includes("500"));
        assert.ok(err.message.includes("Internal Groq LPU cluster error"));
        assert.ok(!err.message.includes("Confidential private candidate resume text"));
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Groq Provider Error Handling: Malformed JSON output throws error", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "This is not JSON at all." } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const provider = new GroqScreeningProvider("gsk_dummy_test_token");
    await assert.rejects(
      () =>
        provider.evaluate({
          sanitizedResumeText: "Sample resume",
          jobDescription: "Sample JD",
          criteria: [{ id: "c1", name: "Test Criterion", weight: 100, isMustHave: false }],
        }),
      (err: any) => err.message.includes("Failed to parse AI provider JSON output")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Groq Provider Error Handling: Missing criteria array in response throws error", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ otherField: 123 }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const provider = new GroqScreeningProvider("gsk_dummy_test_token");
    await assert.rejects(
      () =>
        provider.evaluate({
          sanitizedResumeText: "Sample resume",
          jobDescription: "Sample JD",
          criteria: [{ id: "c1", name: "Test Criterion", weight: 100, isMustHave: false }],
        }),
      (err: any) => err.message.includes("expected top-level criteria array")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

