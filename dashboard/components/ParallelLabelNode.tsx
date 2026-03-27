"use client";

import { memo } from "react";
import type { NodeProps, Node } from "@xyflow/react";

export type ParallelLabelNodeType = Node<Record<string, never>, "parallelLabel">;

function ParallelLabelNodeComponent(_props: NodeProps<ParallelLabelNodeType>) {
  return (
    <div
      style={{ transform: "rotate(-90deg)" }}
      className="text-[8px] font-bold uppercase tracking-[1.2px] text-primary/35 whitespace-nowrap select-none pointer-events-none"
    >
      Parallel
    </div>
  );
}

export const ParallelLabelNode = memo(ParallelLabelNodeComponent);
