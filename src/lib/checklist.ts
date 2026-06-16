export interface ChecklistLine {
  checked: boolean;
  text: string;
}

const checklistLinePattern = /^(\s*)[-*]\s+\[([ xX])\](\s*)(.*)$/;

export function parseChecklistLine(line: string): ChecklistLine | null {
  const match = checklistLinePattern.exec(line);
  if (!match) {
    return null;
  }

  return {
    checked: match[2].toLowerCase() === "x",
    text: match[4],
  };
}

export function toggleChecklistLine(line: string) {
  const match = checklistLinePattern.exec(line);
  if (match) {
    const nextChecked = match[2].toLowerCase() === "x" ? " " : "x";
    return `${match[1]}- [${nextChecked}]${match[3]}${match[4]}`;
  }

  return `- [x] ${line.trim()}`;
}

export function toggleChecklistLineAtIndex(detail: string, lineIndex: number) {
  const lines = detail.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return detail;
  }

  lines[lineIndex] = toggleChecklistLine(lines[lineIndex]);
  return lines.join("\n");
}
