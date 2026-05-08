"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/features/workflow/utils";
import type { WorkflowDocument } from "@/features/workflow/types";

type StatusBarProps = {
  workflow: WorkflowDocument;
  syncLabel?: string | null;
  onRetry: () => void;
};

export function StatusBar({ workflow, syncLabel, onRetry }: StatusBarProps) {
  return (
    <footer className="flex h-11 items-center justify-between border-t border-stone-800 bg-stone-900 px-4 text-xs text-stone-400">
      <div className="flex items-center gap-5">
        <span>Last saved: {formatRelativeTime(workflow.lastSavedAt)}</span>
        <span>Workflow status: {workflow.status}</span>
        <span>Execution state: {workflow.executionState}</span>
        {syncLabel ? <span>{syncLabel}</span> : null}
      </div>

      {workflow.saveError ? (
        <div className="flex items-center gap-2 text-red-300">
          <AlertCircle className="size-4" />
          <span>Unable to save workflow</span>
          <Button variant="ghost" size="sm" onClick={onRetry} className="h-7 rounded-md px-2 text-red-200 hover:bg-red-950/50">
            Retry
          </Button>
        </div>
      ) : null}
    </footer>
  );
}
