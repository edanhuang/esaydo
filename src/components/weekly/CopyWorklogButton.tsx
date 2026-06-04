import { Copy } from "lucide-react";

interface CopyWorklogButtonProps {
  markdown: string;
  onCopied: () => void;
}

export function CopyWorklogButton({ markdown, onCopied }: CopyWorklogButtonProps) {
  async function handleCopy() {
    await navigator.clipboard.writeText(markdown);
    onCopied();
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm"
    >
      <Copy className="h-4 w-4" />
      复制
    </button>
  );
}
