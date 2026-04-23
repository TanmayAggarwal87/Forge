import type { FormEvent } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types/domainTypes";

type ProjectPanelProps = {
  isBusy: boolean;
  onCreateProject: (event: FormEvent<HTMLFormElement>) => void;
  projectDescription: string;
  projectName: string;
  projects: Project[];
  selectedWorkspaceId: string | null;
  setProjectDescription: (description: string) => void;
  setProjectName: (name: string) => void;
};

export function ProjectPanel({
  isBusy,
  onCreateProject,
  projectDescription,
  projectName,
  projects,
  selectedWorkspaceId,
  setProjectDescription,
  setProjectName,
}: ProjectPanelProps) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 font-semibold">
        <FolderKanban className="size-4 text-amber-600" />
        Projects
      </div>
      <form
        onSubmit={onCreateProject}
        className="mb-5 grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 md:grid-cols-[1fr_1.4fr_auto]"
      >
        <input
          className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project name"
          required
        />
        <input
          className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
          value={projectDescription}
          onChange={(event) => setProjectDescription(event.target.value)}
          placeholder="Description"
        />
        <Button disabled={isBusy || !selectedWorkspaceId} className="rounded-xl">
          <Plus />
          Add project
        </Button>
      </form>

      <div className="grid gap-3">
        {projects.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-600">
            No projects yet. Create the first project for this workspace.
          </p>
        ) : (
          projects.map((project) => (
            <article
              key={project.id}
              className="rounded-2xl border border-stone-200 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-stone-600">
                    {project.description ?? "No description"}
                  </p>
                </div>
                <span className="rounded-xl bg-stone-100 px-2 py-1 text-xs text-stone-600">
                  {project.slug}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
