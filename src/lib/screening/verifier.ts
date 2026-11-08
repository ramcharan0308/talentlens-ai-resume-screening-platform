import { VerifiedQuote } from "./types";
import { SourceMap } from "./redaction";

/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds all start indices of a substring in a target string.
 */
function findAllIndices(target: string, query: string): number[] {
  const indices: number[] = [];
  if (!query || !target) return indices;

  let pos = 0;
  while ((pos = target.indexOf(query, pos)) !== -1) {
    indices.push(pos);
    pos += 1;
  }
  return indices;
}

/**
 * Verifies a single quote string against original resume text and optional SourceMap.
 *
 * Requirements enforced:
 * 1. Quotes must be traceable to the original extracted resume text.
 * 2. If the model saw redacted text, maps redacted placeholders/spans back to real source passages.
 * 3. Never claims an altered quote is an exact quote.
 * 4. Whitespace normalization accommodates extraction formatting while preserving exact source offsets.
 * 5. Rejects fabricated, materially altered, ambiguous (unresolvable repeated identical phrases),
 *    or unmappable quotations.
 * 6. If a quote cannot be mapped reliably, marks it unverified (verified: false) and offsets: -1.
 */
export function verifySingleQuote(
  rawQuote: string,
  originalResumeText: string,
  sourceMap?: SourceMap
): VerifiedQuote {
  if (!rawQuote || typeof rawQuote !== "string" || !originalResumeText) {
    return {
      quote: rawQuote || "",
      startOffset: -1,
      endOffset: -1,
      verified: false,
    };
  }

  // Strip wrapping quotes and backticks
  const cleanQuote = rawQuote.trim().replace(/^["'`“]+|["'`”]+$/g, "").trim();

  if (cleanQuote.length < 3) {
    return {
      quote: cleanQuote,
      startOffset: -1,
      endOffset: -1,
      verified: false,
    };
  }

  // 1. Check if the quote contains redacted placeholders (e.g. [REDACTED_EMAIL], [REDACTED_PHONE], [CANDIDATE_NAME])
  const containsPlaceholder = /\[(?:REDACTED_|CANDIDATE_|PROMPT_INJECTION|TAG_STRIPPED)[A-Z_]+\]/.test(cleanQuote);

  if (containsPlaceholder && sourceMap && sourceMap.redactedText) {
    // Locate the quote inside the redacted text that the LLM actually observed
    const redactedIndices = findAllIndices(sourceMap.redactedText, cleanQuote);

    if (redactedIndices.length === 0) {
      // Attempt whitespace-flexible match in redactedText
      const tokens = cleanQuote.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        const pattern = tokens.map(escapeRegex).join("\\s+");
        const regex = new RegExp(pattern, "g");
        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        while ((m = regex.exec(sourceMap.redactedText)) !== null) {
          matches.push(m);
        }

        if (matches.length === 1) {
          const match = matches[0];
          const mapped = sourceMap.mapRedactedSpanToOriginal(
            match.index,
            match.index + match[0].length
          );
          if (mapped) {
            return {
              quote: cleanQuote,
              startOffset: mapped.originalStart,
              endOffset: mapped.originalEnd,
              verified: true,
              originalSourceSnippet: mapped.originalSnippet,
            };
          }
        } else if (matches.length > 1) {
          // Repeated and ambiguous across redacted text
          return {
            quote: cleanQuote,
            startOffset: -1,
            endOffset: -1,
            verified: false,
            isAmbiguous: true,
          };
        }
      }

      // Cannot map placeholder quote to redacted text
      return {
        quote: cleanQuote,
        startOffset: -1,
        endOffset: -1,
        verified: false,
      };
    }

    if (redactedIndices.length > 1) {
      // Ambiguous: multiple identical occurrences of the phrase containing placeholders
      return {
        quote: cleanQuote,
        startOffset: -1,
        endOffset: -1,
        verified: false,
        isAmbiguous: true,
      };
    }

    // Unique match in redacted text! Map to original source span
    const redStart = redactedIndices[0];
    const redEnd = redStart + cleanQuote.length;
    const mapped = sourceMap.mapRedactedSpanToOriginal(redStart, redEnd);

    if (mapped) {
      return {
        quote: cleanQuote,
        startOffset: mapped.originalStart,
        endOffset: mapped.originalEnd,
        verified: true,
        originalSourceSnippet: mapped.originalSnippet,
      };
    }

    return {
      quote: cleanQuote,
      startOffset: -1,
      endOffset: -1,
      verified: false,
    };
  }

  // 2. Direct exact verbatim substring match in originalResumeText
  const directIndices = findAllIndices(originalResumeText, cleanQuote);

  if (directIndices.length === 1) {
    const idx = directIndices[0];
    return {
      quote: cleanQuote,
      startOffset: idx,
      endOffset: idx + cleanQuote.length,
      verified: true,
      originalSourceSnippet: cleanQuote,
    };
  }

  if (directIndices.length > 1) {
    // If SourceMap is present, check if the quote appears uniquely in redacted text
    if (sourceMap && sourceMap.redactedText) {
      const redIndices = findAllIndices(sourceMap.redactedText, cleanQuote);
      if (redIndices.length === 1) {
        const mapped = sourceMap.mapRedactedSpanToOriginal(
          redIndices[0],
          redIndices[0] + cleanQuote.length
        );
        if (mapped) {
          return {
            quote: cleanQuote,
            startOffset: mapped.originalStart,
            endOffset: mapped.originalEnd,
            verified: true,
            originalSourceSnippet: cleanQuote,
          };
        }
      }
    }

    // Ambiguous repeated identical phrase: cannot determine unique intended source passage
    return {
      quote: cleanQuote,
      startOffset: -1,
      endOffset: -1,
      verified: false,
      isAmbiguous: true,
    };
  }

  // 3. Whitespace-flexible token matching (for handling newlines, tabs, and multiple spaces from PDF/DOCX)
  const tokens = cleanQuote.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const pattern = tokens.map(escapeRegex).join("\\s+");
    const regex = new RegExp(pattern, "g");
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(originalResumeText)) !== null) {
      matches.push(m);
    }

    if (matches.length === 1) {
      const match = matches[0];
      const matchedString = match[0];
      // Verify token-by-token equality to ensure no words were altered or added
      const matchedTokens = matchedString.split(/\s+/).filter(Boolean);
      const isExactTokens =
        tokens.length === matchedTokens.length &&
        tokens.every((t, i) => t.toLowerCase() === matchedTokens[i].toLowerCase());

      if (isExactTokens) {
        return {
          quote: matchedString,
          startOffset: match.index,
          endOffset: match.index + matchedString.length,
          verified: true,
          originalSourceSnippet: matchedString,
        };
      }
    } else if (matches.length > 1) {
      // Multiple matches without surrounding disambiguation -> Ambiguous
      return {
        quote: cleanQuote,
        startOffset: -1,
        endOffset: -1,
        verified: false,
        isAmbiguous: true,
      };
    }
  }

  // 4. Quote is fabricated, materially altered, or unmappable
  return {
    quote: cleanQuote,
    startOffset: -1,
    endOffset: -1,
    verified: false,
  };
}

/**
 * Batch verifies an array of quote strings against original resume text and SourceMap.
 */
export function verifyQuotes(
  rawQuotes: string[],
  originalResumeText: string,
  sourceMap?: SourceMap
): VerifiedQuote[] {
  if (!Array.isArray(rawQuotes) || !originalResumeText) {
    return [];
  }

  return rawQuotes
    .map((q) => verifySingleQuote(q, originalResumeText, sourceMap))
    .filter((q) => q.quote.length > 0);
}

/**
 * Filters and returns only programmatically verified quotes.
 */
export function getOnlyVerifiedQuotes(quotes: VerifiedQuote[]): VerifiedQuote[] {
  return quotes.filter((q) => q.verified);
}
