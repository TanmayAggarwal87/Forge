import type { FormEvent } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/types/domainTypes";

type WorkspaceSidebarProps = {
  isBusy: boolean;
  onCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  selectedWorkspaceId: string | null;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  setWorkspaceName: (name: string) => void;
  workspaceName: string;
  workspaces: Workspace[];
};

export function WorkspaceSidebar({
  isBusy,
  onCreateWorkspace,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
  setWorkspaceName,
  workspaceName,
  workspaces,
}: WorkspaceSidebarProps) {
  return (
    <aside className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Users className="size-4 text-amber-600" />
        Workspaces
      </div>
      <div className="grid gap-2">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => setSelectedWorkspaceId(workspace.id)}
            className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
              workspace.id === selectedWorkspaceId
                ? "border-stone-950 bg-stone-950 text-white"
                : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50"
            }`}
          >
            <span className="block font-medium">{workspace.name}</span>
            <span className="text-xs opacity-70">{workspace.role}</span>
          </button>
        ))}
      </div>

      <form onSubmit={onCreateWorkspace} className="mt-5 grid gap-2">
        <label className="grid gap-2 text-sm font-medium">
          New workspace
          <input
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Workspace name"
            required
          />
        </label>
        <Button disabled={isBusy} variant="secondary" className="rounded-xl">
          <Plus />
          Create workspace
        </Button>
      </form>
    </aside>
  );
}
