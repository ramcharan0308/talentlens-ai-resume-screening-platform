/**
 * Conservative candidate information extraction from normalized resume text.
 * Strict privacy invariant: Never infers protected traits (age, gender, marital status, etc.).
 * Missing or ambiguous fields are strictly preserved as null.
 */

// Common IT and corporate skills for matching
const STANDARD_SKILLS_DICTIONARY = [
  "Java",
  "Spring Boot",
  "Microservices",
  "Hibernate",
  "REST APIs",
  "PostgreSQL",
  "MySQL",
  "Oracle",
  "Kafka",
  "RabbitMQ",
  "React",
  "Next.js",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Express",
  "Python",
  "Django",
  "FastAPI",
  "AWS",
  "Azure",
  "GCP",
  "Docker",
  "Kubernetes",
  "Terraform",
  "CI/CD",
  "Git",
  "JUnit",
  "Mockito",
  "GraphQL",
  "Redis",
  "MongoDB",
  "KYC",
  "AML",
  "Excel",
  "Financial Analysis",
  "Agile",
  "Scrum",
];

const EXCLUDED_NAME_TOKENS = new Set([
  "CURRICULUM",
  "VITAE",
  "RESUME",
  "CV",
  "SUMMARY",
  "PROFILE",
  "EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "PROJECTS",
  "CONTACT",
  "OBJECTIVE",
  "PROFESSIONAL",
  "WORK",
]);

export interface ExtractedCandidateProfile {
  fullName: string | null;
  currentRole: string | null;
  experienceYears: number | null;
  keySkills: string[];
  noticeDays: number | null;
}

export function parseCandidateFromText(text: string): ExtractedCandidateProfile {
  if (!text || text.trim().length === 0) {
    return {
      fullName: null,
      currentRole: null,
      experienceYears: null,
      keySkills: [],
      noticeDays: null,
    };
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Conservative Name Extraction: Inspect first 5 lines for a clean human name (2-3 title-case words)
  let extractedName: string | null = null;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Reject lines containing emails, phone numbers, or section headers
    if (
      line.includes("@") ||
      line.match(/\d{5,}/) ||
      line.length > 50 ||
      line.length < 3
    ) {
      continue;
    }

    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const isHeaderToken = words.some((w) =>
        EXCLUDED_NAME_TOKENS.has(w.toUpperCase())
      );
      if (!isHeaderToken && words.every((w) => /^[A-Z][a-zA-Z.'-]*$/.test(w))) {
        extractedName = line;
        break;
      }
    }
  }

  // 2. Experience Extraction: Look for explicit years of experience patterns
  let extractedExp: number | null = null;
  const expMatch = text.match(
    /(?:total\s+)?(?:experience|exp)[\s:]*(?:approx\.?|about)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)/i
  );
  if (expMatch && expMatch[1]) {
    const val = parseFloat(expMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 50) {
      extractedExp = val;
    }
  } else {
    // Secondary match: e.g. "6+ years of experience"
    const secondaryMatch = text.match(/(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)\s+(?:of\s+)?experience/i);
    if (secondaryMatch && secondaryMatch[1]) {
      const val = parseFloat(secondaryMatch[1]);
      if (!isNaN(val) && val >= 0 && val <= 50) {
        extractedExp = val;
      }
    }
  }

  // 3. Notice Period Extraction: Look for patterns like "30 days notice" or "notice period: 60 days"
  let extractedNotice: number | null = null;
  const noticeDaysMatch = text.match(/(?:notice\s*(?:period)?[\s:]*)?(\d{1,3})\s*(?:days?|day)\s*(?:notice)?/i);
  if (noticeDaysMatch && noticeDaysMatch[1]) {
    const days = parseInt(noticeDaysMatch[1], 10);
    if (!isNaN(days) && days >= 0 && days <= 180) {
      extractedNotice = days;
    }
  } else {
    const noticeMonthsMatch = text.match(/(?:notice\s*(?:period)?[\s:]*)?(\d)\s*(?:months?|month)\s*(?:notice)?/i);
    if (noticeMonthsMatch && noticeMonthsMatch[1]) {
      const months = parseInt(noticeMonthsMatch[1], 10);
      if (!isNaN(months) && months >= 1 && months <= 6) {
        extractedNotice = months * 30;
      }
    }
  }

  // 4. Skills Tagging: Exact boundary matching against dictionary
  const matchedSkills: string[] = [];
  const textLower = ` ${text.toLowerCase()} `;
  for (const skill of STANDARD_SKILLS_DICTIONARY) {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(textLower)) {
      matchedSkills.push(skill);
    }
  }

  // 5. Current Role Extraction (conservative heuristics):
  let extractedRole: string | null = null;
  const roleKeywords = [
    "Senior Java Developer",
    "Java Developer",
    "Software Engineer",
    "Senior Software Engineer",
    "Full Stack Developer",
    "Backend Developer",
    "KYC Analyst",
    "DevOps Engineer",
    "Cloud Engineer",
    "QA Engineer",
    "Data Engineer",
  ];
  for (const role of roleKeywords) {
    const roleRegex = new RegExp(`\\b${role}\\b`, "i");
    if (roleRegex.test(text)) {
      extractedRole = role;
      break;
    }
  }

  return {
    fullName: extractedName,
    currentRole: extractedRole,
    experienceYears: extractedExp,
    keySkills: matchedSkills,
    noticeDays: extractedNotice,
  };
}

