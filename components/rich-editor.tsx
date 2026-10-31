"use client";

import * as React from "react";
import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeSummary } from "@/lib/format";

export interface RichEditorHandle {
  getHTML: () => string;
}

const TOOLS = [
  { cmd: "bold", icon: Bold, label: "Gras" },
  { cmd: "italic", icon: Italic, label: "Italique" },
  { cmd: "underline", icon: Underline, label: "Souligné" },
  { cmd: "insertUnorderedList", icon: List, label: "Liste à puces" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Liste numérotée" },
] as const;

export const RichEditor = React.forwardRef<RichEditorHandle, { initialHTML: string; readOnly?: boolean }>(function RichEditor(
  { initialHTML, readOnly },
  ref
) {
  const el = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (el.current) el.current.innerHTML = safeSummary(initialHTML);
  }, [initialHTML]);

  React.useImperativeHandle(ref, () => ({ getHTML: () => safeSummary(el.current?.innerHTML ?? "") }));

  const exec = (cmd: string) => {
    el.current?.focus();
    document.execCommand(cmd, false);
  };

  return (
    <div className="grid gap-2">
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Mise en forme">
          {TOOLS.map(({ cmd, icon: Icon, label }) => (
            <button
              key={cmd}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(cmd)}
              className="grid h-9 min-w-9 cursor-pointer place-items-center rounded-md border border-input bg-[#f8f9ff] px-2.5 hover:bg-accent"
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      )}
      <div
        ref={el}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        aria-label="Synthèse de l’événement"
        data-placeholder="Rédigez ici le compte rendu de la rencontre…"
        className={cn(
          "rich-content min-h-52 rounded-md border border-input p-4 text-sm leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          readOnly && "bg-muted/60"
        )}
      />
    </div>
  );
});
