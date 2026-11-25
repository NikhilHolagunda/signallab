"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Right-side sheet (shadcn API shape) animated with Framer Motion.
 * Non-modal: the 3D graph behind stays interactive so you can hop
 * between nodes without closing the panel.
 */
export function Sheet({
  open,
  onClose,
  children,
  className,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()} modal={false}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Content
              forceMount
              asChild
              onInteractOutside={(e) => e.preventDefault()}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <motion.aside
                initial={{ x: "105%", opacity: 0.4 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "105%", opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 32 }}
                className={cn(
                  "glass hairline-top fixed inset-y-3 right-3 z-40 flex w-[min(94vw,480px)] flex-col overflow-hidden rounded-2xl outline-none",
                  className,
                )}
              >
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Details for the selected node
                </DialogPrimitive.Description>
                {children}
                <DialogPrimitive.Close className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted transition hover:bg-white/5 hover:text-fg">
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </motion.aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
