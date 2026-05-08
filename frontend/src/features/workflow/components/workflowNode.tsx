"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { nodeDefinitionsByType } from "@/features/workflow/nodeRegistry";
import { useUiStore } from "@/stores/uiStore";
import type { WorkflowNode as WorkflowCanvasNode } from "@/features/workflow/types";

export const WorkflowNode = memo(function WorkflowNode({
  id,
  data,
  selected,
}: NodeProps<WorkflowCanvasNode>) {
  const definition = nodeDefinitionsByType[data.type];
  const setConfigNodeId = useUiStore((state) => state.setConfigNodeId);
  const connectionStyles = getConnectionStyles(data.connectionState, selected);

  return (
    <div
      className={`min-w-56 rounded-lg border bg-stone-900 shadow-lg shadow-black/20 transition ${connectionStyles.container}`}
    >
      <Handle type="target" position={Position.Left} className={`!h-3 !w-3 !border-2 !border-stone-900 ${connectionStyles.targetHandle}`} />
      <div className="flex items-start justify-between gap-3 border-b border-stone-800 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            {definition.category}
          </p>
          <h3 className="mt-1 truncate text-sm font-semibold text-stone-50">
            {data.label}
          </h3>
        </div>
        <button
          type="button"
          className="nodrag nopan rounded-md border border-stone-700 bg-stone-950 p-1.5 text-stone-300 transition hover:border-amber-400 hover:text-amber-300"
          title="Edit node settings"
          onClick={(event) => {
            event.stopPropagation();
            setConfigNodeId(id);
          }}
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs leading-5 text-stone-300">{definition.description}</p>
      </div>
      <Handle type="source" position={Position.Right} className={`!h-3 !w-3 !border-2 !border-stone-900 ${connectionStyles.sourceHandle}`} />
    </div>
  );
});

function getConnectionStyles(
  state: WorkflowCanvasNode["data"]["connectionState"],
  selected: boolean,
) {
  if (state === "source") {
    return {
      container: "border-orange-500 shadow-[0_0_0_1px_rgba(249,115,22,0.18)]",
      sourceHandle: "!bg-orange-600",
      targetHandle: "!bg-slate-600",
    };
  }

  if (state === "validTarget") {
    return {
      container: "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]",
      sourceHandle: "!bg-slate-600",
      targetHandle: "!bg-emerald-600",
    };
  }

  if (state === "invalidTarget") {
    return {
      container: "border-stone-700 opacity-45 grayscale",
      sourceHandle: "!bg-slate-400",
      targetHandle: "!bg-slate-400",
    };
  }

  return {
    container: selected
      ? "border-amber-500 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]"
      : "border-stone-700",
    sourceHandle: "!bg-slate-600",
    targetHandle: "!bg-slate-600",
  };
}
