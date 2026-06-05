import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      onClick={handleCopy}
      className="shadow-easydo-glow"
    >
      <Copy data-icon="inline-start" />
      复制
    </Button>
  );
}
