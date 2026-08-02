export interface CodeBlock {
  code: string;
  language: string;
  info: string;
}

interface SourceLine {
  text: string;
  ending: string;
}

interface OpenFence {
  marker: "`" | "~";
  length: number;
  info: string;
  language: string;
  content: string[];
}

function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char !== "\n" && char !== "\r") continue;

    const ending = char === "\r" && source[index + 1] === "\n" ? "\r\n" : char;
    lines.push({ text: source.slice(start, index), ending });
    if (ending === "\r\n") index++;
    start = index + 1;
  }

  if (start < source.length) {
    lines.push({ text: source.slice(start), ending: "" });
  }

  return lines;
}

function parseOpeningFence(line: string): OpenFence | undefined {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return undefined;

  const fence = match[2];
  const marker = fence[0] as "`" | "~";
  const rawInfo = match[3];
  if (marker === "`" && rawInfo.includes("`")) return undefined;

  const info = rawInfo.trim();
  return {
    marker,
    length: fence.length,
    info,
    language: info.split(/\s+/, 1)[0] || "plain",
    content: [],
  };
}

function isClosingFence(line: string, open: OpenFence): boolean {
  const match = /^( {0,3})(`+|~+)[ \t]*$/.exec(line);
  return Boolean(match && match[2][0] === open.marker && match[2].length >= open.length);
}

function removeFinalLineEnding(content: string): string {
  return content.replace(/(?:\r\n|\n|\r)$/, "");
}

export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let open: OpenFence | undefined;

  for (const line of splitLines(markdown)) {
    if (!open) {
      open = parseOpeningFence(line.text);
      continue;
    }

    if (isClosingFence(line.text, open)) {
      blocks.push({
        code: removeFinalLineEnding(open.content.join("")),
        language: open.language,
        info: open.info,
      });
      open = undefined;
      continue;
    }

    open.content.push(line.text + line.ending);
  }

  if (open) {
    blocks.push({ code: open.content.join(""), language: open.language, info: open.info });
  }

  return blocks;
}
