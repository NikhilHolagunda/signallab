import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-black/30 px-3 font-mono text-sm text-fg placeholder:text-dim",
        "outline-none transition focus:border-neon-cyan/60 focus:shadow-glow-cyan",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full rounded-lg border border-line bg-black/30 px-3 py-2 font-mono text-sm text-fg placeholder:text-dim",
      "outline-none transition focus:border-neon-cyan/60 focus:shadow-glow-cyan",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
