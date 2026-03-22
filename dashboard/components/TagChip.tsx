import { cn } from "@/lib/utils";
import { TAG_COLORS } from "@/lib/constants";
import { X } from "lucide-react";

interface TagChipProps {
  label: string;
  color?: keyof typeof TAG_COLORS;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export function TagChip({ label, color, onRemove, size = "sm", className }: TagChipProps) {
  const colors = color ? TAG_COLORS[color] : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        size === "sm" ? "text-[10px]" : "text-xs",
        colors ? `${colors.bg} ${colors.text}` : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {colors && <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", colors.dot)} />}
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Remove ${label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
