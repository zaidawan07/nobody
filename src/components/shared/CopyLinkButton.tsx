import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Copy-to-clipboard button for a value that must never be shown in full.
 *
 * An invitation link is a single-use credential, so it lives in a selectable
 * input plus the clipboard -- not in prose someone might screenshot and leave
 * on screen. Extracted from the team screen so both places that issue a link
 * hand it over identically:
 *
 *   * agency team screen -- an admin inviting a colleague
 *   * CreateAgencyDialog -- the platform owner issuing the first admin's link
 */
export function CopyLinkButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success("Link copied");
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("Couldn't copy. Select the link and copy it manually.");
        }
      }}
    >
      {done ? <CheckCircle2 className="size-4" /> : "Copy"}
    </Button>
  );
}
