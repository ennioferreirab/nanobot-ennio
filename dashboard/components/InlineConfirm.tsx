"use client";

import * as motion from "motion/react-client";
import { Button } from "@/components/ui/button";

interface InlineConfirmProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning" | "default";
  isLoading?: boolean;
}

export function InlineConfirm({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  isLoading = false,
}: InlineConfirmProps) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-2 border-t pt-2 mt-2">
        <span className="text-xs text-muted-foreground flex-1">{message}</span>
        <Button
          size="sm"
          variant={variant}
          className="h-6 px-2 text-xs min-h-[44px] md:min-h-0"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs min-h-[44px] md:min-h-0"
          onClick={onCancel}
          disabled={isLoading}
        >
          {cancelLabel}
        </Button>
      </div>
    </motion.div>
  );
}
