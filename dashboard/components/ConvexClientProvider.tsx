"use client";

import { ReactNode, useMemo } from "react";
// eslint-disable-next-line no-restricted-imports -- root provider must import from convex/react directly
import { ConvexProvider, ConvexReactClient } from "convex/react";

function getConvexUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_CONVEX_URL!;
  }
  // Derive from current hostname so Tailscale / remote access works
  const hostname = window.location.hostname;
  const convexPort = new URL(process.env.NEXT_PUBLIC_CONVEX_URL!).port || "3210";
  return `http://${hostname}:${convexPort}`;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => new ConvexReactClient(getConvexUrl()), []);
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
