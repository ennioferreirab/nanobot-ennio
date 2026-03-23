const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

/**
 * Get 2-character initials from an agent name.
 * If multi-word: first letter of first two words.
 * If single word: first 2 characters.
 */
export function getInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/);
  const first = (s: string) => [...s][0] ?? "";
  if (words.length >= 2) {
    return (first(words[0]) + first(words[1])).toUpperCase();
  }
  return [...displayName].slice(0, 2).join("").toUpperCase();
}

/**
 * Deterministic color from agent name hash.
 * Returns a Tailwind bg color class (e.g., "bg-blue-500").
 */
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
