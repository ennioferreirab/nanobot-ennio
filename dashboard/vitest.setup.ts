import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver; provide a no-op stub so components
// that depend on it (e.g. @radix-ui/react-scroll-area) do not throw.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Radix UI uses requestAnimationFrame for animations. jsdom does not implement
// rAF properly, causing act() to spin indefinitely waiting for animations to
// settle. Replace with a synchronous-ish setTimeout(0) so act() can flush.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);

// Radix UI also calls getAnimations() on elements for transition coordination.
// jsdom does not implement it; return an empty array so it skips animation waits.
Object.defineProperty(window.HTMLElement.prototype, "getAnimations", {
  value: () => [],
  writable: true,
});
