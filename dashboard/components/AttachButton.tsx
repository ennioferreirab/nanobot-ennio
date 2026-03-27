"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface AttachButtonProps {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function AttachButton({ onClick, className, disabled }: AttachButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-8 h-8 rounded-full bg-[#1e1e1e] border border-[#333] text-[#999] flex items-center justify-center hover:bg-[#252525] hover:text-[#bbb] transition-colors",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}
