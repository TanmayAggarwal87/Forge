import { Injectable } from '@nestjs/common';
import type { GeneratedArtifact } from '../identity.types';
import { ForgeMemoryState } from './forge-memory-state.service';
import { WorkflowStore } from './workflow.store';
import { WorkflowVersionStore } from './workflow-version.store';

@Injectable()
export class GeneratedArtifactStore {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly workflowStore: WorkflowStore,
    private readonly workflowVersionStore: WorkflowVersionStore,
  ) {}

  replaceGeneratedArtifactsForVersion(
    workflowVersionId: string,
    artifacts: GeneratedArtifact[],
  ): GeneratedArtifact[] {
    const version =
      this.workflowVersionStore.getWorkflowVersionById(workflowVersionId);
    for (const artifact of Array.from(this.state.generatedArtifacts.values())) {
      if (artifact.workflowVersionId === workflowVersionId) {
        this.state.generatedArtifacts.delete(artifact.id);
      }
    }

    const normalizedArtifacts = artifacts.map((artifact) => ({
      ...artifact,
      projectId: version.projectId,
      workflowId: version.workflowId,
      workflowVersionId,
    }));

    for (const artifact of normalizedArtifacts) {
      this.state.generatedArtifacts.set(artifact.id, artifact);
    }

    return normalizedArtifacts;
  }

  listGeneratedArtifactsForPublishedWorkflow(
    projectId: string,
    workflowId: string,
    userId: string,
  ): GeneratedArtifact[] {
    const workflow = this.workflowStore.getPublishedWorkflowForUser(
      projectId,
      workflowId,
      userId,
    );

    return this.listGeneratedArtifactsForVersion(workflow.publishedVersion.id);
  }

  listGeneratedArtifactsForVersion(
    workflowVersionId: string,
  ): GeneratedArtifact[] {
    return Array.from(this.state.generatedArtifacts.values())
      .filter((artifact) => artifact.workflowVersionId === workflowVersionId)
      .sort((left, right) =>
        left.type === right.type
          ? left.name.localeCompare(right.name)
          : left.type.localeCompare(right.type),
      );
  }
}
