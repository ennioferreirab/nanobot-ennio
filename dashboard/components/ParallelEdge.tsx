"use client";

import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

interface ParallelEdgeData {
  isParallelFork?: boolean;
  isParallelJoin?: boolean;
}

const DOT_RADIUS = 5;

function ParallelEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const edgeData = data as ParallelEdgeData | undefined;
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
  });

  return (
    <>
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      {edgeData?.isParallelFork && (
        <circle
          cx={sourceX}
          cy={sourceY}
          r={DOT_RADIUS}
          fill="hsl(var(--background))"
          stroke="#2383e2"
          strokeWidth={2}
        />
      )}
      {edgeData?.isParallelJoin && (
        <circle
          cx={targetX}
          cy={targetY}
          r={DOT_RADIUS}
          fill="hsl(var(--background))"
          stroke="#555"
          strokeWidth={2}
        />
      )}
    </>
  );
}

export const ParallelEdge = memo(ParallelEdgeComponent);
