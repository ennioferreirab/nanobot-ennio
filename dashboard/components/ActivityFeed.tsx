"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FeedItem } from "./FeedItem";
import { motion } from "motion/react";

export function ActivityFeed() {
  const { results: activities, status, loadMore } = usePaginatedQuery(
    api.activities.listPaginated,
    {},
    { initialNumItems: 20 }
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const prevCountRef = useRef(0);
  const hadDataRef = useRef(false);

  // Track whether we previously had data (for reconnection detection)
  if (activities.length > 0) {
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
    const atTop = el.scrollTop < 30;
    setIsAtTop(atTop);
    if (atTop) {
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

  // Auto-scroll to top when new items arrive and user is at top
  useEffect(() => {
    if (activities.length > prevCountRef.current) {
      if (isAtTop) {
        requestAnimationFrame(() => {
          viewportRef.current?.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        });
      } else {
        setHasNewActivity(true);
      }
    }
    prevCountRef.current = activities.length;
  }, [activities, isAtTop]);

  // IntersectionObserver: load more when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && status === "CanLoadMore") {
          loadMore(20);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [status, loadMore]);

  const scrollToTop = () => {
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setHasNewActivity(false);
    setIsAtTop(true);
  };

  // Reconnecting state: had data before but now loading first page
  if (status === "LoadingFirstPage" && hadDataRef.current) {
    return (
      <div className="p-4">
        <p className="text-xs text-muted-foreground italic">Reconnecting...</p>
      </div>
    );
  }

  // Loading state
  if (status === "LoadingFirstPage") return null;

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
          {status === "Exhausted" && (
            <p className="text-xs text-center text-muted-foreground py-2">
              No more activity
            </p>
          )}
          <div ref={sentinelRef} className="h-1" />
        </div>
      </ScrollArea>

      {hasNewActivity && (
        <button
          onClick={scrollToTop}
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
