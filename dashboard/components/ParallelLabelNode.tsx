"use client";

import { memo } from "react";
import type { NodeProps, Node } from "@xyflow/react";

export type ParallelLabelNodeType = Node<Record<string, never>, "parallelLabel">;

function ParallelLabelNodeComponent(_props: NodeProps<ParallelLabelNodeType>) {
  return <div className="select-none pointer-events-none" />;
}

export const ParallelLabelNode = memo(ParallelLabelNodeComponent);
