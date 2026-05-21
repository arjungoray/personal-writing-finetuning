function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const arrayStart = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  const start =
    arrayStart === -1 ? objectStart : objectStart === -1 ? arrayStart : Math.min(arrayStart, objectStart);
  if (start === -1) return trimmed;

  const open = trimmed[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, index + 1);
    }
  }

  return trimmed.slice(start);
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function repairTruncatedJsonArray(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return text;

  const lastCompleteObject = trimmed.lastIndexOf("},");
  if (lastCompleteObject !== -1) return `${trimmed.slice(0, lastCompleteObject + 1)}]`;

  const lastObject = trimmed.lastIndexOf("}");
  if (lastObject !== -1) return `${trimmed.slice(0, lastObject + 1)}]`;

  return text;
}

function extractCompleteArrayObjectTexts(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return [];

  const objects: string[] = [];
  let start = -1;
  let objectDepth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[" && objectDepth > 0) arrayDepth += 1;
    if (char === "]" && objectDepth > 0 && arrayDepth > 0) arrayDepth -= 1;
    if (char === "{") {
      if (objectDepth === 0 && arrayDepth === 0) start = index;
      objectDepth += 1;
      continue;
    }
    if (char === "}" && objectDepth > 0) {
      objectDepth -= 1;
      if (objectDepth === 0 && arrayDepth === 0 && start !== -1) {
        objects.push(trimmed.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function parseCompleteArrayObjects(text: string): unknown[] | null {
  const objectTexts = extractCompleteArrayObjectTexts(text);
  if (objectTexts.length === 0) return null;

  const parsed = objectTexts.flatMap((objectText) => {
    for (const attempt of [objectText, removeTrailingCommas(objectText)]) {
      try {
        return [JSON.parse(attempt)];
      } catch {
        continue;
      }
    }
    return [];
  });
  return parsed.length > 0 ? parsed : null;
}

export function parseJsonFromText<T>(text: string): T {
  const candidate = extractJsonCandidate(text);
  const attempts = [
    candidate,
    removeTrailingCommas(candidate),
    repairTruncatedJsonArray(candidate),
    removeTrailingCommas(repairTruncatedJsonArray(candidate)),
  ];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      continue;
    }
  }

  const arrayObjects = parseCompleteArrayObjects(candidate);
  if (arrayObjects !== null) return arrayObjects as T;

  const preview = candidate.slice(Math.max(0, candidate.length - 120));
  throw new Error(`Failed to parse JSON from model output. Tail: ...${preview}`);
}
