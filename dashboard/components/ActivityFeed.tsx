"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FeedItem } from "./FeedItem";
import { motion } from "motion/react";

export function ActivityFeed() {
  const activities = useQuery(api.activities.listRecent);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const prevCountRef = useRef(0);
  const hadDataRef = useRef(false);

  // Track whether we previously had data (for reconnection detection)
  if (activities !== undefined && activities.length > 0) {
    hadDataRef.current = true;
  }

  // Capture the ScrollArea viewport element
  const scrollAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      // The Radix ScrollArea viewport is the first child with data-radix-scroll-area-viewport
      const viewport = node.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLDivElement | null;
      if (viewport) {
        viewportRef.current = viewport;
      }
    }
  }, []);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setHasNewActivity(false);
    }
  }, []);

  // Attach scroll listener to viewport
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, activities]);

  // Auto-scroll when new items arrive and user is at bottom
  useEffect(() => {
    if (!activities) return;

    if (activities.length > prevCountRef.current) {
      if (isAtBottom) {
        requestAnimationFrame(() => {
          viewportRef.current?.scrollTo({
            top: viewportRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      } else {
        setHasNewActivity(true);
      }
    }
    prevCountRef.current = activities.length;
  }, [activities, isAtBottom]);

  const scrollToBottom = () => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
    setHasNewActivity(false);
    setIsAtBottom(true);
  };

  // Reconnecting state: had data before but now undefined
  if (activities === undefined && hadDataRef.current) {
    return (
      <div className="p-4">
        <p className="text-xs text-muted-foreground italic">Reconnecting...</p>
      </div>
    );
  }

  // Loading state
  if (activities === undefined) return null;

  // Empty state
  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic p-4">
        Waiting for activity...
      </p>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="p-2 space-y-1">
          {activities.map((activity) => (
            <motion.div
              key={activity._id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <FeedItem activity={activity} />
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {hasNewActivity && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 -translate-x-1/2
            bg-blue-500 text-white text-xs px-3 py-1 rounded-full
            shadow-md hover:bg-blue-600 transition-colors"
        >
          New activity
        </button>
      )}
    </div>
  );
}
