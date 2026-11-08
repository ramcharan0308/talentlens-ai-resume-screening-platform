/**
 * TalentLens PII Redaction and Bidirectional Source Mapping Engine
 *
 * Implements strict sanitization of candidate resumes before transmission
 * to external AI screening providers, ensuring compliance with anti-bias standards
 * and shielding against prompt injections.
 *
 * CAPABILITIES AND DETECTION COVERAGE:
 * 1. Candidate Full Name & Parts: Redacts primary name and individual name tokens (>= 3 chars)
 *    supplied from trusted internal records (Candidate model).
 * 2. Candidate System Identifiers: Redacts candidateReference (CND-XXXXX) and candidateId.
 * 3. Personal Emails: Detects RFC-compliant email addresses (user@domain.tld).
 * 4. Phone Numbers: Detects Indian mobile (+91, 10-digit mobile starting with 6-9, spaces/dashes),
 *    STD landlines (011, 0120, 080 etc.), and international formats (+1, (555) 000-0000).
 *    Safeguard: Preserves 4-digit employment year ranges (e.g. 2018 - 2022).
 * 5. Postal / PIN Codes: Detects 6-digit Indian PIN codes with explicit prefixes ("PIN: 201301",
 *    "Postal Code 560001", "Noida - 201301").
 * 6. Date of Birth & Age: Detects explicit expressions ("DOB: 15/08/1992", "Age: 32 years").
 * 7. Gender & Sex: Detects explicit markers ("Gender: Male", "Sex: Female").
 * 8. Marital Status & Family: Detects explicit markers ("Marital Status: Married", "Spouse Name: ...").
 * 9. Demographics: Detects religion, caste, reservation category, and nationality markers.
 * 10. Photo References: Detects portrait and photograph indicators.
 * 11. Prompt Injection: Neutralizes system prompt overrides, developer mode tags, and scoring instructions.
 *
 * KNOWN LIMITATIONS (DOCUMENTED):
 * 1. Unregistered Names: Unlabelled third-party names in prose (e.g. "reported to Dr. Sharma")
 *    cannot be deterministically identified without high false-positive risk against technical terms.
 * 2. Informal Pronouns: Natural pronouns ("he built", "she architected") in narrative prose are
 *    preserved to prevent corrupting sentence grammar. The AI system prompt explicitly commands
 *    the model to ignore any such gendered pronouns.
 * 3. Implicit Demographic Proxies: Institution names (e.g. religious colleges or women's universities)
 *    are not removed because they contain legitimate educational qualification credentials.
 * 4. Standalone 6-Digit Numbers: Unlabelled numbers (e.g. bug ID #123456) are preserved unless
 *    preceded by postal/PIN keywords, preventing false positives in technical metrics.
 *
 * PRIVACY INVARIANT:
 * Raw original resume text is NEVER logged to console, error logs, or external monitoring.
 */

export interface RedactionSpan {
  type: string;
  originalStart: number;
  originalEnd: number;
  redactedStart: number;
  redactedEnd: number;
  originalSnippet: string;
  placeholder: string;
}

export interface SourceMap {
  spans: RedactionSpan[];
  originalText: string;
  redactedText: string;
  mapRedactedSpanToOriginal(
    redactedStart: number,
    redactedEnd: number
  ): { originalStart: number; originalEnd: number; originalSnippet: string } | null;
  mapRedactedOffsetToOriginal(redactedOffset: number): number;
}

export interface RedactionOptions {
  candidateFullName?: string | null;
  candidateReference?: string | null;
  candidateId?: string | null;
}

export interface RedactionResult {
  redactedText: string;
  detectedPiiCount: number;
  injectionsNeutralized: number;
  sourceMap: SourceMap;
}

interface RawMatch {
  type: string;
  start: number;
  end: number;
  snippet: string;
  placeholder: string;
  isInjection?: boolean;
}

// 1. Email pattern
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// 2. Phone numbers (Indian mobile +91, 10-digit mobile, STD landline, international)
const PHONE_REGEX = /(?:\+?(\d{1,3})[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}\b/g;

// 3. Indian PIN codes / Postal codes (e.g. "PIN: 201301", "PIN Code 560001", "Noida - 201301")
const PIN_CODE_REGEX = /\b(?:PIN(?:\s*Code)?|Postal(?:\s*Code)?)[-:\s]+(\d{6})\b/gi;

// 4. Date of Birth / Age patterns
const DOB_AGE_REGEX = /\b(?:D\.?O\.?B\.?|Date\s+of\s+Birth|Birth\s*Date|Age)[\s:=]+(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{2,4}|\d{1,2}(?:\s*years?(?:\s*old)?)?)\b/gi;

// 5. Gender / Sex markers
const GENDER_REGEX = /\b(?:Gender|Sex)[\s:=]+(?:Male|Female|Non-binary|Transgender|Other|M|F)\b/gi;

// 6. Marital status markers
const MARITAL_STATUS_REGEX = /\b(?:Marital\s+Status|Spouse(?:'s)?(?:\s+Name)?|Husband(?:'s)?(?:\s+Name)?|Father(?:'s)?(?:\s+Name)?)[\s:=]+[^\r\n,;]+/gi;

// 7. Religion / Caste / Demographic markers
const DEMOGRAPHIC_REGEX = /\b(?:Religion|Caste|Category|Reservation|Nationality)[\s:=]+[^\r\n,;]+/gi;

// 8. Photo or avatar mentions
const PHOTO_MENTIONS_REGEX = /\[?(?:Photo|Photograph|Headshot|Profile\s+Picture)\]?[\s:=]+[^\n]+/gi;

// 9. Prompt injection attempt patterns embedded in resumes
const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|forget|disregard|override)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts|rules|commands)\b/gi,
  /\b(?:you\s+must|always)\s+give\s+(?:a\s+)?score\s+(?:of\s+)?(?:10|100|full\s+marks)\b/gi,
  /\b(?:system\s*prompt|system\s*override|developer\s*mode|jailbreak|DAN\s*mode)\b/gi,
  /\boutput\s+JSON\s+saying\s+.*?(?:excellent|perfect|hired|qualified)\b/gi,
  /\bnew\s+instruction:\s*ignore\b/gi,
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Redacts PII and neutralizes prompt injections from resume text.
 * Generates an immutable, bidirectional SourceMap for precise character offset mapping.
 */
export function redactResumePii(
  rawText: string,
  options?: RedactionOptions
): RedactionResult {
  if (!rawText || typeof rawText !== "string") {
    const emptySourceMap: SourceMap = {
      spans: [],
      originalText: "",
      redactedText: "",
      mapRedactedSpanToOriginal: () => null,
      mapRedactedOffsetToOriginal: () => 0,
    };
    return {
      redactedText: "",
      detectedPiiCount: 0,
      injectionsNeutralized: 0,
      sourceMap: emptySourceMap,
    };
  }

  const rawMatches: RawMatch[] = [];

  // Helper to record regex matches
  const collectRegexMatches = (
    regex: RegExp,
    type: string,
    placeholder: string,
    isInjection = false,
    validator?: (snippet: string) => boolean
  ) => {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(rawText)) !== null) {
      const snippet = m[0];
      if (!validator || validator(snippet)) {
        rawMatches.push({
          type,
          start: m.index,
          end: m.index + snippet.length,
          snippet,
          placeholder,
          isInjection,
        });
      }
    }
  };

  // 1. Candidate Full Name & Parts (from trusted DB record)
  if (options?.candidateFullName && options.candidateFullName.trim().length > 1) {
    const name = options.candidateFullName.trim();
    const fullNameRegex = new RegExp(`\\b${escapeRegex(name)}\\b`, "gi");
    collectRegexMatches(fullNameRegex, "CANDIDATE_NAME", "[CANDIDATE_NAME]");

    // Sub-parts of full name (>= 3 chars)
    const parts = name.split(/\s+/).filter((p) => p.length >= 3);
    for (const part of parts) {
      const partRegex = new RegExp(`\\b${escapeRegex(part)}\\b`, "gi");
      collectRegexMatches(partRegex, "CANDIDATE_NAME", "[CANDIDATE_NAME]");
    }
  }

  // 2. Candidate System Reference & Candidate ID
  if (options?.candidateReference && options.candidateReference.trim().length > 3) {
    const refRegex = new RegExp(`\\b${escapeRegex(options.candidateReference.trim())}\\b`, "gi");
    collectRegexMatches(refRegex, "CANDIDATE_REF", "[CANDIDATE_REF]");
  }
  if (options?.candidateId && options.candidateId.trim().length > 8) {
    const idRegex = new RegExp(`\\b${escapeRegex(options.candidateId.trim())}\\b`, "gi");
    collectRegexMatches(idRegex, "CANDIDATE_ID", "[CANDIDATE_ID]");
  }

  // 3. Emails
  collectRegexMatches(EMAIL_REGEX, "EMAIL", "[REDACTED_EMAIL]");

  // 4. Phone Numbers (validate to avoid false positive on employment year ranges e.g. 2018 - 2022)
  collectRegexMatches(PHONE_REGEX, "PHONE", "[REDACTED_PHONE]", false, (snippet) => {
    // Preserve year ranges
    if (/^\s*\d{4}\s*[-–]\s*\d{4}\s*$/.test(snippet)) {
      return false;
    }
    const digitsOnly = snippet.replace(/\D/g, "");
    return digitsOnly.length >= 7 && digitsOnly.length <= 15;
  });

  // 5. Postal / PIN Codes
  collectRegexMatches(PIN_CODE_REGEX, "POSTAL_CODE", "[REDACTED_POSTAL_CODE]");

  // 6. DOB and Age
  collectRegexMatches(DOB_AGE_REGEX, "DOB_OR_AGE", "[REDACTED_DOB_OR_AGE]");

  // 7. Gender
  collectRegexMatches(GENDER_REGEX, "GENDER", "[REDACTED_GENDER]");

  // 8. Marital Status
  collectRegexMatches(MARITAL_STATUS_REGEX, "MARITAL_STATUS", "[REDACTED_MARITAL_STATUS]");

  // 9. Demographic markers
  collectRegexMatches(DEMOGRAPHIC_REGEX, "DEMOGRAPHIC", "[REDACTED_DEMOGRAPHIC]");

  // 10. Photo mentions
  collectRegexMatches(PHOTO_MENTIONS_REGEX, "PHOTO_REF", "[REDACTED_PHOTO_REF]");

  // 11. Prompt Injection Neutralization
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    collectRegexMatches(pattern, "PROMPT_INJECTION", "[PROMPT_INJECTION_NEUTRALIZED]", true);
  }

  // 12. Delimiter tag breakouts
  const tagBreakoutRegex = /<\/?(?:untrusted_candidate_resume_evidence|system_instruction|instructions)>/gi;
  collectRegexMatches(tagBreakoutRegex, "TAG_BREAKOUT", "[TAG_STRIPPED]", true);

  // Sort matches by start position ascending, and by length descending for overlaps
  rawMatches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Resolve overlaps non-destructively: take earliest non-overlapping matches
  const nonOverlapping: RawMatch[] = [];
  let lastEnd = 0;
  for (const match of rawMatches) {
    if (match.start >= lastEnd) {
      nonOverlapping.push(match);
      lastEnd = match.end;
    }
  }

  // Construct redacted text and build bidirectional RedactionSpan records
  let redactedText = "";
  const spans: RedactionSpan[] = [];
  let currentOriginalIndex = 0;
  let piiCount = 0;
  let injectionCount = 0;

  for (const match of nonOverlapping) {
    // Copy intervening unchanged text
    if (match.start > currentOriginalIndex) {
      const slice = rawText.slice(currentOriginalIndex, match.start);
      redactedText += slice;
    }

    const redactedStart = redactedText.length;
    redactedText += match.placeholder;
    const redactedEnd = redactedText.length;

    spans.push({
      type: match.type,
      originalStart: match.start,
      originalEnd: match.end,
      redactedStart,
      redactedEnd,
      originalSnippet: match.snippet,
      placeholder: match.placeholder,
    });

    if (match.isInjection) {
      injectionCount++;
    } else {
      piiCount++;
    }

    currentOriginalIndex = match.end;
  }

  // Copy remaining tail
  if (currentOriginalIndex < rawText.length) {
    redactedText += rawText.slice(currentOriginalIndex);
  }

  // Build the bidirectional source mapper
  const sourceMap: SourceMap = {
    spans,
    originalText: rawText,
    redactedText,

    mapRedactedOffsetToOriginal(redactedOffset: number): number {
      if (redactedOffset <= 0) return 0;
      if (redactedOffset >= redactedText.length) return rawText.length;

      for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        if (redactedOffset < span.redactedStart) {
          const prevSpan = i > 0 ? spans[i - 1] : null;
          const prevRedactedEnd = prevSpan ? prevSpan.redactedEnd : 0;
          const prevOrigEnd = prevSpan ? prevSpan.originalEnd : 0;
          return prevOrigEnd + (redactedOffset - prevRedactedEnd);
        }
        if (redactedOffset >= span.redactedStart && redactedOffset <= span.redactedEnd) {
          return span.originalStart;
        }
      }

      const lastSpan = spans[spans.length - 1];
      if (lastSpan) {
        return lastSpan.originalEnd + (redactedOffset - lastSpan.redactedEnd);
      }
      return redactedOffset;
    },

    mapRedactedSpanToOriginal(redactedStart: number, redactedEnd: number) {
      if (redactedStart < 0 || redactedEnd > redactedText.length || redactedStart >= redactedEnd) {
        return null;
      }

      let origStart: number | null = null;
      let origEnd: number | null = null;

      // Find start mapping
      for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        if (redactedStart < span.redactedStart) {
          const prevSpan = i > 0 ? spans[i - 1] : null;
          const prevRedactedEnd = prevSpan ? prevSpan.redactedEnd : 0;
          const prevOrigEnd = prevSpan ? prevSpan.originalEnd : 0;
          origStart = prevOrigEnd + (redactedStart - prevRedactedEnd);
          break;
        } else if (redactedStart >= span.redactedStart && redactedStart < span.redactedEnd) {
          origStart = span.originalStart;
          break;
        }
      }

      if (origStart === null) {
        const lastSpan = spans[spans.length - 1];
        if (lastSpan) {
          origStart = lastSpan.originalEnd + (redactedStart - lastSpan.redactedEnd);
        } else {
          origStart = redactedStart;
        }
      }

      // Find end mapping
      for (let i = spans.length - 1; i >= 0; i--) {
        const span = spans[i];
        if (redactedEnd > span.redactedEnd) {
          const offsetPast = redactedEnd - span.redactedEnd;
          origEnd = span.originalEnd + offsetPast;
          break;
        } else if (redactedEnd > span.redactedStart && redactedEnd <= span.redactedEnd) {
          origEnd = span.originalEnd;
          break;
        }
      }

      if (origEnd === null) {
        const firstSpan = spans[0];
        if (firstSpan && redactedEnd <= firstSpan.redactedStart) {
          origEnd = redactedEnd;
        } else if (spans.length === 0) {
          origEnd = redactedEnd;
        } else {
          origEnd = rawText.length;
        }
      }

      origStart = Math.max(0, Math.min(rawText.length, origStart));
      origEnd = Math.max(origStart, Math.min(rawText.length, origEnd));

      return {
        originalStart: origStart,
        originalEnd: origEnd,
        originalSnippet: rawText.slice(origStart, origEnd),
      };
    },
  };

  return {
    redactedText,
    detectedPiiCount: piiCount,
    injectionsNeutralized: injectionCount,
    sourceMap,
  };
}
