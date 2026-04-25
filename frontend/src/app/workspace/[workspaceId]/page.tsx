import { WorkspaceEditor } from "@/features/workflow/components/workspaceEditor";

type WorkspacePageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceId } = await params;

  return <WorkspaceEditor workspaceId={workspaceId} />;
}
