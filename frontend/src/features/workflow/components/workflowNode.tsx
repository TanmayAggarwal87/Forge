"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeDefinitionsByType } from "@/features/workflow/nodeRegistry";
import type { WorkflowNode as WorkflowCanvasNode } from "@/features/workflow/types";

export const WorkflowNode = memo(function WorkflowNode({
  data,
  selected,
}: NodeProps<WorkflowCanvasNode>) {
  const definition = nodeDefinitionsByType[data.type];

  return (
    <div
      className={`min-w-56 rounded-lg border bg-white shadow-sm transition ${
        selected ? "border-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.12)]" : "border-slate-300"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-slate-600" />
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {definition.category}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">{data.label}</h3>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs leading-5 text-slate-600">{definition.description}</p>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-slate-600" />
    </div>
  );
});
