/**
 * parse-yaml.ts
 *
 * Lightweight YAML parser for the spec subset we use.
 * No external dependencies. Handles:
 *   - Key-value maps (nested via indentation)
 *   - Arrays (- item)
 *   - Folded block scalars (>)
 *   - Literal block scalars (|)
 *   - Inline flow mappings { key: value }
 *   - Inline flow sequences [ a, b ]
 *   - Quoted strings (single and double)
 *   - Comments (#)
 *   - Bare strings, numbers, booleans, null
 */

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export function parseYaml(input: string): YamlValue {
  const lines = input.split("\n");
  const result = parseBlock(lines, 0, 0);
  return result.value;
}

interface ParseResult {
  value: YamlValue;
  nextLine: number;
}

function parseBlock(lines: string[], start: number, _minIndent: number): ParseResult {
  // Determine if this block is a map or array
  let i = start;
  i = skipEmpty(lines, i);
  if (i >= lines.length) return { value: null, nextLine: i };

  const firstLine = lines[i];
  const firstIndent = getIndent(firstLine);
  const trimmed = firstLine.trim();

  if (trimmed.startsWith("- ") || trimmed === "-") {
    return parseArray(lines, i, firstIndent);
  }
  return parseMap(lines, i, firstIndent);
}

function parseMap(lines: string[], start: number, blockIndent: number): ParseResult {
  const map: { [key: string]: YamlValue } = {};
  let i = start;

  while (i < lines.length) {
    i = skipEmpty(lines, i);
    if (i >= lines.length) break;

    const line = lines[i];
    const indent = getIndent(line);
    if (indent < blockIndent) break;
    if (indent > blockIndent) break; // belongs to parent

    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) break; // array at same level

    const colonIdx = findUnquotedColon(trimmed);
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = trimmed
      .slice(0, colonIdx)
      .trim()
      .replace(/^["']|["']$/g, "");
    const afterColon = trimmed.slice(colonIdx + 1).trim();

    if (
      afterColon === "" ||
      afterColon === "|" ||
      afterColon === ">" ||
      afterColon === "|-" ||
      afterColon === ">-" ||
      afterColon === "|+" ||
      afterColon === ">+"
    ) {
      // Block scalar or nested structure
      if (afterColon === "|" || afterColon === "|-" || afterColon === "|+") {
        const block = readBlockScalar(lines, i + 1, indent);
        map[key] = block.text;
        i = block.nextLine;
      } else if (afterColon === ">" || afterColon === ">-" || afterColon === ">+") {
        const block = readFoldedScalar(lines, i + 1, indent);
        map[key] = block.text;
        i = block.nextLine;
      } else {
        // Empty value — check next line for nested content
        const nextNonEmpty = skipEmpty(lines, i + 1);
        if (nextNonEmpty < lines.length && getIndent(lines[nextNonEmpty]) > indent) {
          const nested = parseBlock(lines, nextNonEmpty, getIndent(lines[nextNonEmpty]));
          map[key] = nested.value;
          i = nested.nextLine;
        } else {
          map[key] = null;
          i++;
        }
      }
    } else {
      // Inline value
      map[key] = parseInlineValue(afterColon);
      i++;
    }
  }

  return { value: map, nextLine: i };
}

function parseArray(lines: string[], start: number, blockIndent: number): ParseResult {
  const arr: YamlValue[] = [];
  let i = start;

  while (i < lines.length) {
    i = skipEmpty(lines, i);
    if (i >= lines.length) break;

    const line = lines[i];
    const indent = getIndent(line);
    if (indent < blockIndent) break;
    if (indent > blockIndent) break;

    const trimmed = line.trim();
    if (!trimmed.startsWith("- ") && trimmed !== "-") break;

    const itemContent = trimmed === "-" ? "" : trimmed.slice(2).trim();

    if (itemContent === "" || itemContent === "|" || itemContent === ">") {
      // Multi-line array item or nested structure
      if (itemContent === "|") {
        const block = readBlockScalar(lines, i + 1, indent);
        arr.push(block.text);
        i = block.nextLine;
      } else if (itemContent === ">") {
        const block = readFoldedScalar(lines, i + 1, indent);
        arr.push(block.text);
        i = block.nextLine;
      } else {
        const nextNonEmpty = skipEmpty(lines, i + 1);
        if (nextNonEmpty < lines.length && getIndent(lines[nextNonEmpty]) > indent) {
          const nested = parseBlock(lines, nextNonEmpty, getIndent(lines[nextNonEmpty]));
          arr.push(nested.value);
          i = nested.nextLine;
        } else {
          arr.push(null);
          i++;
        }
      }
    } else if (itemContent.includes(": ") || itemContent.includes(":\n")) {
      // Array item that starts a map: - key: value
      // Reconstruct as a map starting at deeper indent
      const subLines = [
        " ".repeat(indent + 2) + itemContent,
        ...collectSubBlock(lines, i + 1, indent + 2),
      ];
      const sub = parseMap(subLines, 0, indent + 2);
      arr.push(sub.value);
      i = i + 1 + (sub.nextLine > 0 ? collectSubBlock(lines, i + 1, indent + 2).length : 0);
    } else {
      arr.push(parseInlineValue(itemContent));
      i++;
    }
  }

  return { value: arr, nextLine: i };
}

function collectSubBlock(lines: string[], start: number, minIndent: number): string[] {
  const result: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      result.push(line);
      i++;
      continue;
    }
    if (getIndent(line) >= minIndent) {
      result.push(line);
      i++;
    } else break;
  }
  return result;
}

function readBlockScalar(
  lines: string[],
  start: number,
  _parentIndent: number,
): { text: string; nextLine: number } {
  const collected: string[] = [];
  let i = start;
  let blockIndent = -1;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      collected.push("");
      i++;
      continue;
    }
    const indent = getIndent(line);
    if (blockIndent === -1) blockIndent = indent;
    if (indent < blockIndent) break;
    collected.push(line.slice(blockIndent));
    i++;
  }

  // Trim trailing empty lines
  while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();

  return { text: `${collected.join("\n")}\n`, nextLine: i };
}

function readFoldedScalar(
  lines: string[],
  start: number,
  _parentIndent: number,
): { text: string; nextLine: number } {
  const paragraphs: string[] = [];
  let currentPara: string[] = [];
  let i = start;
  let blockIndent = -1;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(" "));
        currentPara = [];
      }
      paragraphs.push("");
      i++;
      continue;
    }
    const indent = getIndent(line);
    if (blockIndent === -1) blockIndent = indent;
    if (indent < blockIndent) break;
    currentPara.push(line.trim());
    i++;
  }

  if (currentPara.length > 0) paragraphs.push(currentPara.join(" "));

  // Trim trailing empty entries
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === "") paragraphs.pop();

  return { text: `${paragraphs.join("\n")}\n`, nextLine: i };
}

function parseInlineValue(raw: string): YamlValue {
  // Remove trailing comment
  const val = stripInlineComment(raw);

  if (val === "" || val === "null" || val === "~") return null;
  if (val === "true" || val === "True" || val === "TRUE") return true;
  if (val === "false" || val === "False" || val === "FALSE") return false;

  // Quoted string
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
  }

  // Flow sequence [ a, b, c ]
  if (val.startsWith("[") && val.endsWith("]")) {
    return parseFlowSequence(val);
  }

  // Flow mapping { key: value }
  if (val.startsWith("{") && val.endsWith("}")) {
    return parseFlowMapping(val);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    return Number(val);
  }

  return val;
}

function parseFlowSequence(raw: string): YamlValue[] {
  const inner = raw.slice(1, -1).trim();
  if (inner === "") return [];
  return splitFlowItems(inner).map((item) => parseInlineValue(item.trim()));
}

function parseFlowMapping(raw: string): { [key: string]: YamlValue } {
  const inner = raw.slice(1, -1).trim();
  if (inner === "") return {};
  const map: { [key: string]: YamlValue } = {};
  for (const pair of splitFlowItems(inner)) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair
      .slice(0, colonIdx)
      .trim()
      .replace(/^["']|["']$/g, "");
    const val = pair.slice(colonIdx + 1).trim();
    map[key] = parseInlineValue(val);
  }
  return map;
}

function splitFlowItems(s: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      current += ch;
      if (ch === inQuote && s[i - 1] !== "\\") inQuote = null;
    } else if (ch === '"' || ch === "'") {
      current += ch;
      inQuote = ch;
    } else if (ch === "[" || ch === "{") {
      depth++;
      current += ch;
    } else if (ch === "]" || ch === "}") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(current);
  return items;
}

function findUnquotedColon(s: string): number {
  let inQuote: string | null = null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === inQuote && s[i - 1] !== "\\") inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === "[" || ch === "{") {
      depth++;
    } else if (ch === "]" || ch === "}") {
      depth--;
    } else if (
      ch === ":" &&
      depth === 0 &&
      (i + 1 >= s.length || s[i + 1] === " " || s[i + 1] === "\n")
    ) {
      return i;
    }
  }
  return -1;
}

function stripInlineComment(s: string): string {
  let inQuote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === inQuote && s[i - 1] !== "\\") inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === "#" && (i === 0 || s[i - 1] === " ")) {
      return s.slice(0, i).trim();
    }
  }
  return s.trim();
}

function getIndent(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === " ") i++;
  return i;
}

function skipEmpty(lines: string[], start: number): number {
  let i = start;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    break;
  }
  return i;
}
