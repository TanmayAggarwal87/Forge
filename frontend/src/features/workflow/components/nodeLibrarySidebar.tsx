"use client";

import { useEffect, useState, type DragEventHandler } from "react";
import {
  Bell,
  ChevronDown,
  Clock3,
  Code2,
  Database,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageSquare,
  Network,
  Search,
  Send,
  ShieldCheck,
  Split,
  Timer,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  nodeCategories,
  nodeDefinitions,
  nodeDefinitionsByType,
} from "@/features/workflow/nodeRegistry";
import {
  applyWorkflowTemplate,
  workflowTemplates,
  type WorkflowTemplate,
} from "@/features/workflow/workflowTemplates";
import { useUiStore } from "@/stores/uiStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import type { WorkflowDocument, WorkflowNodeType } from "@/features/workflow/types";

type LibraryPlaceholder = {
  label: string;
  description: string;
  category: string;
  badge: string;
  icon: LucideIcon;
};

const categoryIcons: Record<string, LucideIcon> = {
  Triggers: Zap,
  Authentication: LockKeyhole,
  Communication: Send,
  Logic: Split,
  Database,
  "API / Integrations": Network,
};

const nodeIcons: Partial<Record<WorkflowNodeType, LucideIcon>> = {
  httpTrigger: Zap,
  webhookTrigger: Network,
  generateOtp: KeyRound,
  verifyOtp: ShieldCheck,
  jwtSign: ShieldCheck,
  passwordHash: LockKeyhole,
  createVerificationToken: KeyRound,
  verifyToken: ShieldCheck,
  generateResetToken: KeyRound,
  verifyResetToken: ShieldCheck,
  verifySignature: ShieldCheck,
  sendEmail: Mail,
  sendSms: MessageSquare,
  delay: Timer,
  condition: Split,
  databaseWrite: Database,
  databaseRead: Database,
  databaseUpdate: Database,
  webhookResponse: Network,
};

const comingSoonNodes: LibraryPlaceholder[] = [
  {
    label: "Schedule Trigger",
    description: "Start a flow on a recurring schedule.",
    category: "Triggers",
    badge: "Soon",
    icon: Clock3,
  },
  {
    label: "Send Push Notification",
    description: "Dispatch a mobile or web push event.",
    category: "Communication",
    badge: "Soon",
    icon: Bell,
  },
  {
    label: "Transform Data",
    description: "Map payload fields into a new shape.",
    category: "Logic",
    badge: "Soon",
    icon: Code2,
  },
];

type NodeLibrarySidebarProps = {
  workspaceId: string;
  workflow: WorkflowDocument;
  templates?: WorkflowTemplate[];
  templatesError?: string | null;
  templatesLoading?: boolean;
};

export function NodeLibrarySidebar({
  workspaceId,
  workflow,
  templates = workflowTemplates,
  templatesError = null,
  templatesLoading = false,
}: NodeLibrarySidebarProps) {
  const [templateToast, setTemplateToast] = useState<string | null>(null);
  const nodeSearch = useUiStore((state) => state.nodeSearch);
  const collapsedCategories = useUiStore((state) => state.collapsedCategories);
  const activeNodeCategory = useUiStore((state) => state.activeNodeCategory);
  const recentlyUsedNodeTypes = useUiStore((state) => state.recentlyUsedNodeTypes);
  const setNodeSearch = useUiStore((state) => state.setNodeSearch);
  const toggleCategory = useUiStore((state) => state.toggleCategory);
  const setActiveNodeCategory = useUiStore((state) => state.setActiveNodeCategory);
  const setConfigNodeId = useUiStore((state) => state.setConfigNodeId);
  const setDragNodeType = useUiStore((state) => state.setDragNodeType);
  const recordRecentlyUsedNode = useUiStore((state) => state.recordRecentlyUsedNode);
  const replaceSnapshot = useWorkflowStore((state) => state.replaceSnapshot);

  const query = nodeSearch.trim().toLowerCase();
  const recentlyUsedNodes = recentlyUsedNodeTypes
    .map((type) => nodeDefinitionsByType[type])
    .filter(Boolean);
  const matchingNodeCount = nodeDefinitions.filter((definition) =>
    matchesNode(definition.label, definition.description, query),
  ).length;
  const matchingPlaceholderCount = comingSoonNodes.filter((definition) =>
    matchesNode(definition.label, definition.description, query),
  ).length;
  const hasSearchResults = matchingNodeCount + matchingPlaceholderCount > 0;

  useEffect(() => {
    if (!templateToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setTemplateToast(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [templateToast]);

  function handleUseTemplate(template: WorkflowTemplate) {
    const appliedTemplate = applyWorkflowTemplate(workflow, template);
    replaceSnapshot(workspaceId, appliedTemplate.snapshot);
    setConfigNodeId(appliedTemplate.selectedNodeId);
    setTemplateToast(`${template.name} template added to canvas`);
  }

  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-950 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-50">
      <div className="shrink-0 border-b border-slate-200 p-4 dark:border-stone-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-amber-300">
              Forge
            </p>
            <h2 className="mt-1 text-sm font-semibold text-slate-950 dark:text-stone-50">
              Node Library
            </h2>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400">
            Drag
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-stone-500" />
          <input
            value={nodeSearch}
            onChange={(event) => setNodeSearch(event.target.value)}
            placeholder="Search nodes..."
            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-950 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-amber-400"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <section className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-stone-800 dark:bg-stone-950/60">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-stone-400">
            <Workflow className="size-3.5 text-slate-700 dark:text-amber-300" />
            Quick Start
          </div>
          <div className="mt-3 grid gap-2">
            {templatesLoading ? (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                Loading templates...
              </div>
            ) : null}

            {!templatesLoading && templates.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
                No templates found
              </div>
            ) : null}

            {templatesError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {templatesError}
              </div>
            ) : null}

            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUseTemplate={() => handleUseTemplate(template)}
              />
            ))}
          </div>
        </section>

        {recentlyUsedNodes.length > 0 && !query ? (
          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Recently Used
              </p>
            </div>
            <div className="grid gap-1.5">
              {recentlyUsedNodes.map((definition) => (
                <NodeCard
                  key={`recent-${definition.type}`}
                  type={definition.type}
                  label={definition.label}
                  description={definition.description}
                  badge="Recent"
                  compact
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "application/forge-node",
                      definition.type,
                    );
                    event.dataTransfer.effectAllowed = "move";
                    setDragNodeType(definition.type as WorkflowNodeType);
                    recordRecentlyUsedNode(definition.type);
                  }}
                  onDragEnd={() => setDragNodeType(null)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!hasSearchResults ? (
          <div className="mt-8 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
            <Search className="mx-auto size-5 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              No matching nodes
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Try searching for trigger, OTP, email, condition, or database.
            </p>
          </div>
        ) : null}

        {nodeCategories.map((category) => {
          const isCollapsed = collapsedCategories.includes(category);
          const CategoryIcon = categoryIcons[category] ?? Workflow;
          const items = nodeDefinitions.filter((definition) => {
            if (definition.category !== category) {
              return false;
            }

            return matchesNode(definition.label, definition.description, query);
          });
          const placeholders = comingSoonNodes.filter(
            (definition) =>
              definition.category === category &&
              matchesNode(definition.label, definition.description, query),
          );

          if (items.length === 0 && placeholders.length === 0) {
            return null;
          }

          return (
            <section key={category} className="mb-4">
              <button
                type="button"
                onClick={() => {
                  toggleCategory(category);
                  setActiveNodeCategory(category);
                }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition ${
                  activeNodeCategory === category
                    ? "bg-slate-950 text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                  <CategoryIcon className="size-3.5" />
                  {category}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      activeNodeCategory === category
                        ? "bg-white/15 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {items.length + placeholders.length}
                  </span>
                  <ChevronDown
                    className={`size-4 transition ${
                      isCollapsed ? "-rotate-90" : "rotate-0"
                    }`}
                  />
                </span>
              </button>

              {!isCollapsed ? (
                <div className="mt-2 grid gap-1.5">
                  {items.map((definition) => (
                    <NodeCard
                      key={definition.type}
                      type={definition.type}
                      label={definition.label}
                      description={definition.description}
                      badge={getNodeBadge(definition.type)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "application/forge-node",
                          definition.type,
                        );
                        event.dataTransfer.effectAllowed = "move";
                        setDragNodeType(definition.type as WorkflowNodeType);
                        setActiveNodeCategory(category);
                        recordRecentlyUsedNode(definition.type);
                      }}
                      onDragEnd={() => setDragNodeType(null)}
                    />
                  ))}

                  {placeholders.map((definition) => (
                    <DisabledNodeCard
                      key={`${category}-${definition.label}`}
                      definition={definition}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {templateToast ? (
        <div className="pointer-events-none absolute bottom-4 left-3 right-3 rounded-md border border-slate-300 bg-slate-950 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-black/20">
          {templateToast}
        </div>
      ) : null}
    </aside>
  );
}

function TemplateCard({
  template,
  onUseTemplate,
}: {
  template: WorkflowTemplate;
  onUseTemplate: () => void;
}) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950">
            {template.name}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {template.description}
          </p>
        </div>
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {template.difficulty}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-slate-500">
        <span>{template.nodes.length} nodes</span>
        <span className="text-slate-300">/</span>
        <span>{template.category}</span>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-1 overflow-hidden text-[10px] text-slate-500">
        {template.preview.map((item, index) => (
          <span
            key={`${template.id}-${item}-${index}`}
            className="flex items-center gap-1"
          >
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
              {item}
            </span>
            {index < template.preview.length - 1 ? (
              <span className="text-slate-400">-&gt;</span>
            ) : null}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={onUseTemplate}
        className="mt-3 h-8 w-full rounded-md border border-slate-950 bg-slate-950 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        Use Template
      </button>
    </article>
  );
}

function NodeCard({
  type,
  label,
  description,
  badge,
  compact = false,
  onDragStart,
  onDragEnd,
}: {
  type: WorkflowNodeType;
  label: string;
  description: string;
  badge: string;
  compact?: boolean;
  onDragStart: DragEventHandler<HTMLButtonElement>;
  onDragEnd: DragEventHandler<HTMLButtonElement>;
}) {
  const Icon = nodeIcons[type] ?? Workflow;

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group w-full rounded-md border border-transparent bg-white p-3 text-left transition hover:border-slate-200 hover:bg-slate-50 focus-visible:border-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 group-hover:border-slate-300">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-950">
              {label}
            </span>
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {badge}
            </span>
          </span>
          {!compact ? (
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {description}
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

function DisabledNodeCard({
  definition,
}: {
  definition: LibraryPlaceholder;
}) {
  const Icon = definition.icon;

  return (
    <button
      type="button"
      disabled
      className="w-full cursor-not-allowed rounded-md border border-slate-100 bg-slate-50 p-3 text-left opacity-70"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-400">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-500">
              {definition.label}
            </span>
            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              {definition.badge}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-400">
            {definition.description}
          </span>
        </span>
      </div>
    </button>
  );
}

function matchesNode(label: string, description: string, query: string) {
  if (!query) {
    return true;
  }

  return (
    label.toLowerCase().includes(query) ||
    description.toLowerCase().includes(query)
  );
}

function getNodeBadge(type: WorkflowNodeType) {
  switch (type) {
    case "httpTrigger":
      return "Trigger";
    case "webhookTrigger":
    case "webhookResponse":
      return "API";
    case "generateOtp":
    case "verifyOtp":
    case "jwtSign":
    case "passwordHash":
    case "createVerificationToken":
    case "verifyToken":
    case "generateResetToken":
    case "verifyResetToken":
    case "verifySignature":
      return "Auth";
    case "sendEmail":
    case "sendSms":
      return "IO";
    case "databaseRead":
    case "databaseWrite":
    case "databaseUpdate":
      return "DB";
    case "delay":
    case "condition":
      return "Logic";
    default:
      return "Node";
  }
}
