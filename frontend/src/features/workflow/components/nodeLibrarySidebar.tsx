"use client";

import { ChevronDown, Search } from "lucide-react";
import { nodeCategories, nodeDefinitions } from "@/features/workflow/nodeRegistry";
import { useUiStore } from "@/stores/uiStore";
import type { WorkflowNodeType } from "@/features/workflow/types";

export function NodeLibrarySidebar() {
  const nodeSearch = useUiStore((state) => state.nodeSearch);
  const collapsedCategories = useUiStore((state) => state.collapsedCategories);
  const setNodeSearch = useUiStore((state) => state.setNodeSearch);
  const toggleCategory = useUiStore((state) => state.toggleCategory);
  const setDragNodeType = useUiStore((state) => state.setDragNodeType);

  const query = nodeSearch.trim().toLowerCase();

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Node Library</h2>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={nodeSearch}
            onChange={(event) => setNodeSearch(event.target.value)}
            placeholder="Search nodes"
            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-950"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {nodeCategories.map((category) => {
          const isCollapsed = collapsedCategories.includes(category);
          const items = nodeDefinitions.filter((definition) => {
            if (definition.category !== category) {
              return false;
            }

            if (!query) {
              return true;
            }

            return (
              definition.label.toLowerCase().includes(query) ||
              definition.description.toLowerCase().includes(query)
            );
          });

          if (items.length === 0) {
            return null;
          }

          return (
            <section key={category} className="mb-3">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 hover:bg-slate-100"
              >
                <span>{category}</span>
                <ChevronDown
                  className={`size-4 transition ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                />
              </button>

              {!isCollapsed ? (
                <div className="mt-1 space-y-1">
                  {items.map((definition) => (
                    <button
                      key={definition.type}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/forge-node", definition.type);
                        event.dataTransfer.effectAllowed = "move";
                        setDragNodeType(definition.type as WorkflowNodeType);
                      }}
                      onDragEnd={() => setDragNodeType(null)}
                      className="w-full rounded-md border border-transparent px-3 py-3 text-left hover:border-slate-200 hover:bg-slate-50"
                    >
                      <div className="text-sm font-medium text-slate-900">{definition.label}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {definition.description}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
