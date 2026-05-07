"use client";

import { useMemo, useState } from "react";
import { ChevronRight, FileCode2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generateCanvasArtifacts,
  type CanvasGeneratedArtifact,
  type CanvasArtifactGenerationResult,
} from "@/features/workflow/artifactGenerator";
import type { WorkflowDocument } from "@/features/workflow/types";

type ArtifactDrawerProps = {
  workflow: WorkflowDocument;
  onClose: () => void;
};

export function ArtifactDrawer({ workflow, onClose }: ArtifactDrawerProps) {
  const [generation, setGeneration] =
    useState<CanvasArtifactGenerationResult | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    null,
  );

  const selectedArtifact = useMemo(() => {
    if (!generation) {
      return null;
    }

    return (
      generation.artifacts.find((artifact) => artifact.id === selectedArtifactId) ??
      generation.artifacts[0] ??
      null
    );
  }, [generation, selectedArtifactId]);

  function handleGenerate() {
    const nextGeneration = generateCanvasArtifacts(workflow);
    setGeneration(nextGeneration);
    setSelectedArtifactId(
      nextGeneration.artifacts.find((artifact) => artifact.type === "openapi")
        ?.id ??
        nextGeneration.artifacts[0]?.id ??
        null,
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-slate-200 bg-white shadow-[-12px_0_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <FileCode2 className="size-4 text-slate-700" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Artifacts
            </p>
            <h2 className="text-sm font-semibold text-slate-900">
              Canvas generation
            </h2>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="rounded-md"
          title="Collapse artifact drawer"
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid gap-3 border-b border-slate-200 p-4">
        <Button onClick={handleGenerate} className="h-10 rounded-md">
          <Play />
          Generate artifacts
        </Button>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Metric label="Nodes" value={workflow.nodes.length} />
          <Metric label="Edges" value={workflow.edges.length} />
          <Metric label="State" value={workflow.status} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!generation ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4">
            {generation.issues.length > 0 ? (
              <div className="grid gap-2">
                {generation.issues.map((issue, index) => (
                  <div
                    key={`${issue.severity}-${index}`}
                    className={`rounded-md border p-3 text-xs ${
                      issue.severity === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {issue.message}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {generation.artifacts.map((artifact) => (
                <ArtifactTab
                  key={artifact.id}
                  artifact={artifact}
                  selected={artifact.id === selectedArtifact?.id}
                  onSelect={() => setSelectedArtifactId(artifact.id)}
                />
              ))}
            </div>

            {selectedArtifact ? (
              <div className="overflow-hidden rounded-md border border-slate-900 bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs text-slate-300">
                  <span>{selectedArtifact.type}</span>
                  <span>{selectedArtifact.checksum}</span>
                </div>
                <pre className="max-h-[calc(100vh-360px)] overflow-auto p-4 text-xs leading-5 text-slate-100">
                  <code>{selectedArtifact.content}</code>
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function ArtifactTab({
  artifact,
  selected,
  onSelect,
}: {
  artifact: CanvasGeneratedArtifact;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
        selected
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
      }`}
    >
      {artifact.name}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full min-h-72 place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-slate-900">
          No artifacts generated yet
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Use Generate artifacts to create an OpenAPI spec, endpoint contract,
          DTO schema, SDK stub, and runtime preview from this canvas.
        </p>
      </div>
    </div>
  );
}
