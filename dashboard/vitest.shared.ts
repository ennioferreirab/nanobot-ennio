import react from "@vitejs/plugin-react";
import path from "path";

export const commonExclude = [
  "e2e/**",
  "**/node_modules/**",
  "**/.worktrees/**",
  "**/.claude/**",
  "**/.claire/**",
];

export const slowInclude = ["**/*.slow.test.ts", "**/*.slow.test.tsx"];

export const sharedConfig = {
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
};
