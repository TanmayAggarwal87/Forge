"use client";

import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/common/brandMark";
import { AuditLogPanel } from "@/components/dashboard/auditLogPanel";
import { MetricCard } from "@/components/dashboard/metricCard";
import { ProjectPanel } from "@/components/dashboard/projectPanel";
import { WorkspaceSidebar } from "@/components/dashboard/workspaceSidebar";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/errorMessage";
import { useForgeApp } from "@/hooks/useForgeApp";

export function DashboardPage() {
  const app = useForgeApp();

  if (app.isLoadingSession || !app.user) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 text-stone-600">
        Checking your session...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fafaf9,#e7e5e4)] text-stone-950">
      <header className="border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <BrandMark />
            <p className="mt-2 text-sm text-stone-600">
              Signed in as {app.user.name} ({app.user.email})
            </p>
          </div>
          <Button variant="outline" onClick={app.handleSignOut} className="rounded-xl">
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr]">
        <WorkspaceSidebar
          isBusy={app.isBusy}
          onCreateWorkspace={app.handleCreateWorkspace}
          selectedWorkspaceId={app.selectedWorkspaceId}
          setSelectedWorkspaceId={app.setSelectedWorkspaceId}
          setWorkspaceName={app.setWorkspaceName}
          workspaceName={app.workspaceName}
          workspaces={app.workspaces}
        />

        <section className="grid gap-5">
          <ErrorMessage message={app.errorMessage} />

          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-stone-500">
                  Active workspace
                </p>
                <h1 className="mt-1 text-2xl font-semibold">
                  {app.selectedWorkspace?.name ?? "Create a workspace"}
                </h1>
                <p className="mt-2 text-sm text-stone-600">
                  Projects created here are scoped by API membership checks.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <MetricCard label="Workspaces" value={app.workspaces.length} />
                <MetricCard label="Projects" value={app.projects.length} />
                <MetricCard label="Audit logs" value={app.auditLogs.length} />
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <ProjectPanel
              isBusy={app.isBusy}
              onCreateProject={app.handleCreateProject}
              projectDescription={app.projectDescription}
              projectName={app.projectName}
              projects={app.projects}
              selectedWorkspaceId={app.selectedWorkspaceId}
              setProjectDescription={app.setProjectDescription}
              setProjectName={app.setProjectName}
            />
            <AuditLogPanel auditLogs={app.auditLogs} />
          </div>
        </section>
      </div>
    </main>
  );
}
