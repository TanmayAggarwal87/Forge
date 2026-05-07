"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  Download,
  FileCode2,
  FolderTree,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generateBackendWorkflowArtifacts,
  type BackendArtifactGenerationMode,
  type BackendGeneratedArtifact,
} from "@/features/workflow/backendWorkflowApi";
import { getErrorMessage } from "@/lib/apiClient";
import type { WorkflowDocument } from "@/features/workflow/types";

type ArtifactDrawerProps = {
  workflow: WorkflowDocument;
  backendWorkflowId: string | null;
  token: string | null;
  onClose: () => void;
};

export function ArtifactDrawer({
  workflow,
  backendWorkflowId,
  token,
  onClose,
}: ArtifactDrawerProps) {
  const [artifacts, setArtifacts] = useState<BackendGeneratedArtifact[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatingMode, setGeneratingMode] =
    useState<BackendArtifactGenerationMode | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    null,
  );
  const isGenerating = generatingMode !== null;

  const selectedArtifact = useMemo(() => {
    return (
      artifacts.find((artifact) => artifact.id === selectedArtifactId) ??
      artifacts[0] ??
      null
    );
  }, [artifacts, selectedArtifactId]);

  const fileTree = useMemo(() => buildFileTree(artifacts), [artifacts]);
  const generationWarnings = useMemo(
    () => collectGenerationWarnings(artifacts),
    [artifacts],
  );

  async function handleGenerate(mode: BackendArtifactGenerationMode) {
    if (!backendWorkflowId || !token) {
      setErrorMessage("Save the workflow to the backend before generating artifacts.");
      return;
    }

    setGeneratingMode(mode);
    setErrorMessage(null);

    try {
      const payload = await generateBackendWorkflowArtifacts(
        backendWorkflowId,
        token,
        mode,
      );
      setArtifacts(payload.generatedArtifacts);
      setSelectedArtifactId(
        payload.generatedArtifacts.find((artifact) =>
          mode === "workflow_definition"
            ? artifact.name === "workflow.definition.ts"
            : artifact.name.endsWith(".module.ts"),
        )?.id ??
          payload.generatedArtifacts[0]?.id ??
          null,
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setGeneratingMode(null);
    }
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
        <Button
          onClick={() => void handleGenerate("workflow_definition")}
          disabled={isGenerating}
          className="h-10 rounded-md"
          variant="outline"
        >
          <Play />
          {generatingMode === "workflow_definition"
            ? "Exporting..."
            : "Export Workflow Definition"}
        </Button>
        <Button
          onClick={() => void handleGenerate("backend_module")}
          disabled={isGenerating}
          className="h-10 rounded-md"
        >
          <FileCode2 />
          {generatingMode === "backend_module"
            ? "Generating..."
            : "Generate Backend Code"}
        </Button>
        {artifacts.length > 0 ? (
          <Button
            onClick={() => downloadArtifactsZip(artifacts)}
            disabled={isGenerating}
            className="h-9 rounded-md"
            variant="outline"
          >
            <Archive className="size-4" />
            Download ZIP
          </Button>
        ) : null}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Metric label="Nodes" value={workflow.nodes.length} />
          <Metric label="Edges" value={workflow.edges.length} />
          <Metric label="State" value={workflow.status} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {errorMessage ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {artifacts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4">
            {generationWarnings.length > 0 ? (
              <GenerationWarnings warnings={generationWarnings} />
            ) : null}

            <FileTreePreview
              tree={fileTree}
              selectedArtifactId={selectedArtifact?.id ?? null}
              onSelect={(artifactId) => setSelectedArtifactId(artifactId)}
            />

            <div className="flex flex-wrap gap-2">
              {artifacts.map((artifact) => (
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
                  <div className="flex items-center gap-2">
                    <span>{selectedArtifact.checksum}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadArtifact(selectedArtifact)}
                      className="h-7 rounded-md px-2 text-slate-100 hover:bg-white/10"
                    >
                      <Download className="size-3.5" />
                      Download
                    </Button>
                  </div>
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

function GenerationWarnings({ warnings }: { warnings: string[] }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <p className="font-semibold">Generation warnings</p>
      <ul className="mt-2 grid gap-1">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

type FileTreeItem = {
  id: string;
  name: string;
  depth: number;
  type: "folder" | "file";
  artifactId?: string;
};

function FileTreePreview({
  tree,
  selectedArtifactId,
  onSelect,
}: {
  tree: FileTreeItem[];
  selectedArtifactId: string | null;
  onSelect: (artifactId: string) => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        <FolderTree className="size-3.5" />
        File tree
      </div>
      <div className="max-h-56 overflow-auto p-2">
        {tree.map((item) =>
          item.type === "folder" ? (
            <div
              key={item.id}
              className="flex h-7 items-center rounded px-2 text-xs font-semibold text-slate-700"
              style={{ paddingLeft: `${8 + item.depth * 14}px` }}
            >
              {item.name}
            </div>
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => item.artifactId && onSelect(item.artifactId)}
              className={`flex h-7 w-full items-center rounded px-2 text-left text-xs ${
                item.artifactId === selectedArtifactId
                  ? "bg-slate-950 text-white"
                  : "text-slate-700 hover:bg-white"
              }`}
              style={{ paddingLeft: `${8 + item.depth * 14}px` }}
            >
              {item.name}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function ArtifactTab({
  artifact,
  selected,
  onSelect,
}: {
  artifact: BackendGeneratedArtifact;
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

function downloadArtifact(artifact: BackendGeneratedArtifact) {
  const blob = new Blob([artifact.content], { type: artifact.contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getFileName(artifact.name);
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadArtifactsZip(artifacts: BackendGeneratedArtifact[]) {
  const blob = createZipBlob(artifacts);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getZipName(artifacts);
  anchor.click();
  URL.revokeObjectURL(url);
}

function EmptyState() {
  return (
    <div className="grid h-full min-h-72 place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-slate-900">
          No artifacts generated yet
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Export workflow metadata for inspection, or generate a NestJS module
          from this canvas.
        </p>
      </div>
    </div>
  );
}

function buildFileTree(artifacts: BackendGeneratedArtifact[]): FileTreeItem[] {
  const items: FileTreeItem[] = [];
  const folderIds = new Set<string>();
  const sortedArtifacts = [...artifacts].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const artifact of sortedArtifacts) {
    const parts = normalizeZipPath(artifact.name).split("/");
    let folderPath = "";

    parts.slice(0, -1).forEach((part, index) => {
      folderPath = folderPath ? `${folderPath}/${part}` : part;

      if (!folderIds.has(folderPath)) {
        folderIds.add(folderPath);
        items.push({
          id: `folder:${folderPath}`,
          name: part,
          depth: index,
          type: "folder",
        });
      }
    });

    items.push({
      id: `file:${artifact.id}`,
      name: parts.at(-1) ?? artifact.name,
      depth: Math.max(parts.length - 1, 0),
      type: "file",
      artifactId: artifact.id,
    });
  }

  return items;
}

function collectGenerationWarnings(artifacts: BackendGeneratedArtifact[]) {
  const warnings = new Set<string>();

  if (artifacts.some((artifact) => artifact.type === "backend_module")) {
    warnings.add(
      "Review README.md and .env.example before using generated backend code.",
    );
  }

  if (
    artifacts.some(
      (artifact) =>
        artifact.name.includes("/providers/") || artifact.name.includes("\\providers\\"),
    )
  ) {
    warnings.add(
      "Generated providers are integration boundaries and may need production replacements.",
    );
  }

  if (artifacts.some((artifact) => artifact.name.endsWith("GENERATION_WARNINGS.md"))) {
    warnings.add("This export includes workflow-specific generation warnings.");
  }

  return [...warnings];
}

function getFileName(path: string) {
  return normalizeZipPath(path).split("/").at(-1) ?? path;
}

function getZipName(artifacts: BackendGeneratedArtifact[]) {
  const firstPath = normalizeZipPath(artifacts[0]?.name ?? "forge-export");
  const root = firstPath.split("/")[0] || "forge-export";

  return `${root}.zip`;
}

function createZipBlob(artifacts: BackendGeneratedArtifact[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const entries: Array<{
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }> = [];
  let offset = 0;

  for (const artifact of artifacts) {
    const nameBytes = encoder.encode(normalizeZipPath(artifact.name));
    const data = encoder.encode(artifact.content);
    const crc = crc32(data);
    const header = createLocalFileHeader(nameBytes, data, crc);

    localParts.push(header, nameBytes, data);
    entries.push({ nameBytes, data, crc, offset });
    offset += header.length + nameBytes.length + data.length;
  }

  const centralDirectoryOffset = offset;

  for (const entry of entries) {
    const header = createCentralDirectoryHeader(entry);
    centralParts.push(header, entry.nameBytes);
    offset += header.length + entry.nameBytes.length;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endRecord = createEndOfCentralDirectoryRecord(
    entries.length,
    centralDirectorySize,
    centralDirectoryOffset,
  );

  const blobParts = [...localParts, ...centralParts, endRecord].map(toBlobPart);

  return new Blob(blobParts, {
    type: "application/zip",
  });
}

function createLocalFileHeader(
  nameBytes: Uint8Array,
  data: Uint8Array,
  crc: number,
) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);

  return header;
}

function createCentralDirectoryHeader(entry: {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.data.length, true);
  view.setUint32(24, entry.data.length, true);
  view.setUint16(28, entry.nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.offset, true);

  return header;
}

function createEndOfCentralDirectoryRecord(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return header;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "") || "artifact.txt";
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const crc32Table = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  }),
);
