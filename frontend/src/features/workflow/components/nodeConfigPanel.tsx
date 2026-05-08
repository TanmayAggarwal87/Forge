"use client";

import { useCallback, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { nodeDefinitionsByType } from "@/features/workflow/nodeRegistry";
import { useWorkflowStore } from "@/stores/workflowStore";
import type { WorkflowNode } from "@/features/workflow/types";

type NodeConfigPanelProps = {
  workspaceId: string;
  node: WorkflowNode | null;
};

export function NodeConfigPanel({ workspaceId, node }: NodeConfigPanelProps) {
  if (!node) {
    return (
      <aside className="flex h-full items-center justify-center border-l border-stone-800 bg-stone-900 p-6 text-sm text-stone-400">
        Select a node to configure its settings.
      </aside>
    );
  }

  return <NodeConfigPanelContent workspaceId={workspaceId} node={node} />;
}

function NodeConfigPanelContent({
  workspaceId,
  node,
}: {
  workspaceId: string;
  node: WorkflowNode;
}) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const definition = nodeDefinitionsByType[node.data.type];
  const handleConfigChange = useCallback(
    (values: Record<string, string | number>) => {
      updateNodeData(workspaceId, node.id, (currentNode) => {
        if (areConfigsEqual(currentNode.data.config, values)) {
          return currentNode;
        }

        return {
          ...currentNode,
          data: {
            ...currentNode.data,
            config: values,
          },
        };
      });
    },
    [node.id, updateNodeData, workspaceId],
  );

  return (
    <aside className="h-full border-l border-stone-800 bg-stone-900 text-stone-100">
      <div className="border-b border-stone-800 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Node Settings
        </p>
        <h2 className="mt-2 text-lg font-semibold text-stone-100">{node.data.label}</h2>
      </div>

      <ConfigForm node={node} onChange={handleConfigChange} />

      <div className="border-t border-stone-800 p-4">
        <p className="text-xs leading-5 text-stone-400">{definition.description}</p>
      </div>
    </aside>
  );
}

type ConfigFormProps = {
  node: WorkflowNode;
  onChange: (values: Record<string, string | number>) => void;
};

function ConfigForm({ node, onChange }: ConfigFormProps) {
  const definition = nodeDefinitionsByType[node.data.type];
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(definition.schema),
    mode: "onChange",
    defaultValues: node.data.config,
  });
  const values = useWatch({ control: form.control });

  useEffect(() => {
    form.reset(node.data.config);
  }, [form, node.data.config, node.id]);

  useEffect(() => {
    const syncValues = async () => {
      const parsed = await definition.schema.safeParseAsync(values);
      if (parsed.success && !areConfigsEqual(node.data.config, parsed.data)) {
        onChange(parsed.data as Record<string, string | number>);
      }
    };

    void syncValues();
  }, [definition.schema, node.data.config, onChange, values]);

  return (
    <form className="space-y-4 p-4">
      {definition.fields.map((field) => {
        const error = form.formState.errors[field.key]?.message;

        return (
          <label key={field.key} className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              {field.label}
            </span>

            {field.type === "textarea" ? (
              <textarea
                {...form.register(field.key)}
                rows={4}
                placeholder={field.placeholder}
                className="w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-amber-400"
              />
            ) : field.type === "select" ? (
              <select
                {...form.register(field.key)}
                className="h-10 w-full rounded-md border border-stone-700 bg-stone-950 px-3 text-sm text-stone-100 outline-none focus:border-amber-400"
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                step={field.step}
                min={field.min}
                placeholder={field.placeholder}
                {...form.register(field.key, {
                  valueAsNumber: field.type === "number",
                })}
                className="h-10 w-full rounded-md border border-stone-700 bg-stone-950 px-3 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-amber-400"
              />
            )}

            {error ? <p className="mt-2 text-xs text-red-300">{String(error)}</p> : null}
          </label>
        );
      })}
    </form>
  );
}

function areConfigsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
