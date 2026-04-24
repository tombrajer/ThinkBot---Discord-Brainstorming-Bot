const tryParseJson = (value: string): unknown | undefined => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const stripSingleFence = (content: string): string => {
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? content.trim();
};

const parseFromFenceBlocks = (content: string): unknown | undefined => {
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of content.matchAll(fencePattern)) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }
    const parsed = tryParseJson(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
};

const parseFromFirstBalancedJson = (content: string): unknown | undefined => {
  const text = content.trim();
  let firstParsedNonObject: unknown | undefined;

  for (let start = 0; start < text.length; start += 1) {
    const opener = text[start];
    if (opener !== "{" && opener !== "[") {
      continue;
    }

    const stack: string[] = [opener === "{" ? "}" : "]"];
    let inString = false;
    let isEscaped = false;

    for (let end = start + 1; end < text.length; end += 1) {
      const char = text[end];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }
        if (char === "\\") {
          isEscaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        stack.push(char === "{" ? "}" : "]");
        continue;
      }

      if (char === "}" || char === "]") {
        const expected = stack.pop();
        if (expected !== char) {
          break;
        }

        if (stack.length === 0) {
          const candidate = text.slice(start, end + 1);
          const parsed = tryParseJson(candidate);
          if (parsed !== undefined) {
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed;
            }
            if (firstParsedNonObject === undefined) {
              firstParsedNonObject = parsed;
            }
          }
          break;
        }
      }
    }
  }

  return firstParsedNonObject;
};

export const parseModelJson = (content: string): unknown => {
  const stripped = stripSingleFence(content);
  const direct = tryParseJson(stripped);
  if (direct !== undefined) {
    return direct;
  }

  const fromFenceBlocks = parseFromFenceBlocks(content);
  if (fromFenceBlocks !== undefined) {
    return fromFenceBlocks;
  }

  const fromBalanced = parseFromFirstBalancedJson(content);
  if (fromBalanced !== undefined) {
    return fromBalanced;
  }

  throw new Error("No JSON object or array found in Ollama response.");
};

