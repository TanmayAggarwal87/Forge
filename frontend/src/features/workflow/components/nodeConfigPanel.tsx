"use client";

import { useEffect } from "react";
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
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  if (!node) {
    return (
      <aside className="flex h-full items-center justify-center border-l border-slate-200 bg-white p-6 text-sm text-slate-500">
        Select a node to configure its settings.
      </aside>
    );
  }

  const definition = nodeDefinitionsByType[node.data.type];

  return (
    <aside className="h-full border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Node Settings
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{node.data.label}</h2>
      </div>

      <ConfigForm
        node={node}
        onChange={(values) => {
          updateNodeData(workspaceId, node.id, (currentNode) => ({
            ...currentNode,
            data: {
              ...currentNode.data,
              config: values,
            },
          }));
        }}
      />

      <div className="border-t border-slate-200 p-4">
        <p className="text-xs leading-5 text-slate-500">{definition.description}</p>
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
      if (parsed.success) {
        onChange(parsed.data as Record<string, string | number>);
      }
    };

    void syncValues();
  }, [definition.schema, onChange, values]);

  return (
    <form className="space-y-4 p-4">
      {definition.fields.map((field) => {
        const error = form.formState.errors[field.key]?.message;

        return (
          <label key={field.key} className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {field.label}
            </span>

            {field.type === "textarea" ? (
              <textarea
                {...form.register(field.key)}
                rows={4}
                placeholder={field.placeholder}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950"
              />
            ) : field.type === "select" ? (
              <select
                {...form.register(field.key)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950"
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
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              />
            )}

            {error ? <p className="mt-2 text-xs text-red-600">{String(error)}</p> : null}
          </label>
        );
      })}
    </form>
  );
}
