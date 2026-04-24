"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, getErrorMessage } from "@/lib/apiClient";
import {
  clearStoredSessionToken,
  getStoredSessionToken,
} from "@/lib/sessionStorage";
import type {
  AuditLog,
  NodeDefinition,
  Project,
  SessionUser,
  Workflow,
  Workspace,
} from "@/types/domainTypes";

type AutosaveState = "idle" | "pending" | "saving" | "saved" | "error";

function createWorkflowSignature(workflow: Workflow | null): string | null {
  if (!workflow) {
    return null;
  }

  return JSON.stringify({
    name: workflow.name,
    description: workflow.description,
    graph: workflow.draftVersion.graph,
  });
}

function createWorkflowSummary(workflow: Workflow): Workflow {
  return workflow;
}

function createClientId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useForgeApp() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(() =>
    getStoredSessionToken(),
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [nodeDefinitions, setNodeDefinitions] = useState<NodeDefinition[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [workflowDraft, setWorkflowDraft] = useState<Workflow | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Core Platform");
  const [projectName, setProjectName] = useState("Workflow API");
  const [projectDescription, setProjectDescription] = useState(
    "Backend workflow builder foundation",
  );
  const [workflowName, setWorkflowName] = useState("Inbound approval flow");
  const [workflowDescription, setWorkflowDescription] = useState(
    "HTTP intake draft for approvals",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const latestDraftSignatureRef = useRef<string | null>(null);
  const latestWorkflowIdRef = useRef<string | null>(null);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      null,
    [selectedWorkspaceId, workspaces],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const request = useCallback(
    async function request<T>(
      path: string,
      options: RequestInit = {},
      activeToken = token,
    ): Promise<T> {
      return apiRequest<T>(path, options, activeToken);
    },
    [token],
  );

  const replaceWorkflowSummary = useCallback((nextWorkflow: Workflow) => {
    setWorkflows((currentWorkflows) => {
      const existingIndex = currentWorkflows.findIndex(
        (workflow) => workflow.id === nextWorkflow.id,
      );

      if (existingIndex === -1) {
        return [nextWorkflow, ...currentWorkflows];
      }

      const nextWorkflows = currentWorkflows.slice();
      nextWorkflows.splice(existingIndex, 1, nextWorkflow);
      return nextWorkflows.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    });
  }, []);

  const markDraftDirty = useCallback((nextWorkflow: Workflow) => {
    const signature = createWorkflowSignature(nextWorkflow);
    latestDraftSignatureRef.current = signature;
    latestWorkflowIdRef.current = nextWorkflow.id;
    setAutosaveState(
      signature && signature !== lastSavedSignatureRef.current ? "pending" : "saved",
    );
    replaceWorkflowSummary(createWorkflowSummary(nextWorkflow));
  }, [replaceWorkflowSummary]);

  const clearSession = useCallback(
    function clearSession() {
      clearStoredSessionToken();
      setToken(null);
      setUser(null);
      setWorkspaces([]);
      setProjects([]);
      setWorkflows([]);
      setNodeDefinitions([]);
      setAuditLogs([]);
      setSelectedWorkspaceId(null);
      setSelectedProjectId(null);
      setSelectedWorkflowId(null);
      setWorkflowDraft(null);
      lastSavedSignatureRef.current = null;
      latestDraftSignatureRef.current = null;
      latestWorkflowIdRef.current = null;
      setAutosaveState("idle");
      router.replace("/login");
    },
    [router],
  );

  const loadNodeDefinitions = useCallback(
    async function loadNodeDefinitions(activeToken: string) {
      const payload = await request<{ nodeDefinitions: NodeDefinition[] }>(
        "/node-definitions",
        {},
        activeToken,
      );
      setNodeDefinitions(payload.nodeDefinitions);
    },
    [request],
  );

  const loadWorkspaces = useCallback(
    async function loadWorkspaces(activeToken = token) {
      const payload = await request<{ workspaces: Workspace[] }>(
        "/workspaces",
        {},
        activeToken,
      );

      setWorkspaces(payload.workspaces);
      setSelectedWorkspaceId((currentWorkspaceId) => {
        if (
          currentWorkspaceId &&
          payload.workspaces.some(
            (workspace) => workspace.id === currentWorkspaceId,
          )
        ) {
          return currentWorkspaceId;
        }

        return payload.workspaces[0]?.id ?? null;
      });
    },
    [request, token],
  );

  const loadProjects = useCallback(
    async function loadProjects(activeToken: string, workspaceId: string) {
      const payload = await request<{ projects: Project[] }>(
        `/workspaces/${workspaceId}/projects`,
        {},
        activeToken,
      );

      setProjects(payload.projects);
      setSelectedProjectId((currentProjectId) => {
        if (
          currentProjectId &&
          payload.projects.some((project) => project.id === currentProjectId)
        ) {
          return currentProjectId;
        }

        return payload.projects[0]?.id ?? null;
      });
    },
    [request],
  );

  const loadAuditLogs = useCallback(
    async function loadAuditLogs(activeToken: string, workspaceId: string) {
      const payload = await request<{ auditLogs: AuditLog[] }>(
        `/audit-logs?workspaceId=${encodeURIComponent(workspaceId)}`,
        {},
        activeToken,
      );
      setAuditLogs(payload.auditLogs);
    },
    [request],
  );

  const loadWorkflows = useCallback(
    async function loadWorkflows(activeToken: string, projectId: string) {
      const payload = await request<{ workflows: Workflow[] }>(
        `/projects/${projectId}/workflows`,
        {},
        activeToken,
      );

      setWorkflows(payload.workflows);
      setSelectedWorkflowId((currentWorkflowId) => {
        if (
          currentWorkflowId &&
          payload.workflows.some((workflow) => workflow.id === currentWorkflowId)
        ) {
          return currentWorkflowId;
        }

        return payload.workflows[0]?.id ?? null;
      });
    },
    [request],
  );

  const loadWorkflowDraft = useCallback(
    async function loadWorkflowDraft(
      activeToken: string,
      projectId: string,
      workflowId: string,
    ) {
      const payload = await request<{ workflow: Workflow }>(
        `/projects/${projectId}/workflows/${workflowId}`,
        {},
        activeToken,
      );

      const signature = createWorkflowSignature(payload.workflow);
      lastSavedSignatureRef.current = signature;
      latestDraftSignatureRef.current = signature;
      latestWorkflowIdRef.current = payload.workflow.id;
      setWorkflowDraft(payload.workflow);
      replaceWorkflowSummary(createWorkflowSummary(payload.workflow));
      setAutosaveState(signature ? "saved" : "idle");
    },
    [replaceWorkflowSummary, request],
  );

  const loadSession = useCallback(
    async function loadSession(activeToken: string) {
      try {
        const session = await request<{ user: SessionUser }>(
          "/auth/session",
          {},
          activeToken,
        );
        setUser(session.user);
        await Promise.all([
          loadWorkspaces(activeToken),
          loadNodeDefinitions(activeToken),
        ]);
      } catch (error) {
        clearSession();
        setErrorMessage(getErrorMessage(error));
      }
    },
    [clearSession, loadNodeDefinitions, loadWorkspaces, request],
  );

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadSession(token);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSession, router, token]);

  useEffect(() => {
    if (!token || !selectedWorkspaceId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void Promise.all([
        loadProjects(token, selectedWorkspaceId),
        loadAuditLogs(token, selectedWorkspaceId),
      ]).catch((error) => setErrorMessage(getErrorMessage(error)));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAuditLogs, loadProjects, selectedWorkspaceId, token]);

  useEffect(() => {
    if (!token || !selectedProjectId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadWorkflows(token, selectedProjectId).catch((error) =>
        setErrorMessage(getErrorMessage(error)),
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadWorkflows, selectedProjectId, token]);

  useEffect(() => {
    if (!token || !selectedProjectId || !selectedWorkflowId) {
      lastSavedSignatureRef.current = null;
      latestDraftSignatureRef.current = null;
      latestWorkflowIdRef.current = null;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadWorkflowDraft(token, selectedProjectId, selectedWorkflowId).catch(
        (error) => setErrorMessage(getErrorMessage(error)),
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadWorkflowDraft, selectedProjectId, selectedWorkflowId, token]);

  useEffect(() => {
    const signature = createWorkflowSignature(workflowDraft);
    latestDraftSignatureRef.current = signature;
    latestWorkflowIdRef.current = workflowDraft?.id ?? null;
  }, [workflowDraft]);

  useEffect(() => {
    const signature = createWorkflowSignature(workflowDraft);

    if (
      !token ||
      !selectedProjectId ||
      !workflowDraft ||
      !signature ||
      signature === lastSavedSignatureRef.current
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const snapshot = workflowDraft;
      const snapshotSignature = signature;

      setIsSavingDraft(true);
      setAutosaveState("saving");

      void request<{ workflow: Workflow }>(
        `/projects/${selectedProjectId}/workflows/${workflowDraft.id}/draft`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: snapshot.name,
            description: snapshot.description,
            graph: snapshot.draftVersion.graph,
          }),
        },
      )
        .then((payload) => {
          const savedWorkflow = payload.workflow;
          const savedSignature = createWorkflowSignature(savedWorkflow);

          lastSavedSignatureRef.current = savedSignature;
          replaceWorkflowSummary(createWorkflowSummary(savedWorkflow));

          if (
            latestWorkflowIdRef.current === savedWorkflow.id &&
            latestDraftSignatureRef.current === snapshotSignature
          ) {
            setWorkflowDraft(savedWorkflow);
            setAutosaveState("saved");
          } else {
            setAutosaveState("pending");
          }
        })
        .catch((error) => {
          setAutosaveState("error");
          setErrorMessage(getErrorMessage(error));
        })
        .finally(() => {
          setIsSavingDraft(false);
        });
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [replaceWorkflowSummary, request, selectedProjectId, token, workflowDraft]);

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const payload = await request<{ workspace: Workspace }>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName }),
      });
      await loadWorkspaces(token);
      setSelectedWorkspaceId(payload.workspace.id);
      setWorkspaceName("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedWorkspaceId) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const payload = await request<{ project: Project }>(
        `/workspaces/${selectedWorkspaceId}/projects`,
        {
          method: "POST",
          body: JSON.stringify({
            name: projectName,
            description: projectDescription,
          }),
        },
      );
      setProjectName("");
      setProjectDescription("");
      await Promise.all([
        loadProjects(token, selectedWorkspaceId),
        loadAuditLogs(token, selectedWorkspaceId),
      ]);
      setSelectedProjectId(payload.project.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedProjectId) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const payload = await request<{ workflow: Workflow }>(
        `/projects/${selectedProjectId}/workflows`,
        {
          method: "POST",
          body: JSON.stringify({
            name: workflowName,
            description: workflowDescription,
          }),
        },
      );
      replaceWorkflowSummary(payload.workflow);
      setSelectedWorkflowId(payload.workflow.id);
      setWorkflowName("");
      setWorkflowDescription("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function handleSelectWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);
    setSelectedProjectId(null);
    setProjects([]);
    setWorkflows([]);
    setSelectedWorkflowId(null);
    setWorkflowDraft(null);
    setAutosaveState("idle");
  }

  function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setWorkflows([]);
    setSelectedWorkflowId(null);
    setWorkflowDraft(null);
    setAutosaveState("idle");
  }

  function handleSelectWorkflow(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    setWorkflowDraft(null);
    setAutosaveState("idle");
  }

  function updateWorkflowDraft(
    updater: (currentWorkflow: Workflow) => Workflow,
  ) {
    setWorkflowDraft((currentWorkflow) => {
      if (!currentWorkflow) {
        return currentWorkflow;
      }

      const nextWorkflow = updater(currentWorkflow);
      markDraftDirty(nextWorkflow);
      return nextWorkflow;
    });
  }

  function handleWorkflowNameChange(value: string) {
    updateWorkflowDraft((currentWorkflow) => ({
      ...currentWorkflow,
      name: value,
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleWorkflowDescriptionChange(value: string) {
    updateWorkflowDraft((currentWorkflow) => ({
      ...currentWorkflow,
      description: value,
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleAddNode(definition: NodeDefinition) {
    updateWorkflowDraft((currentWorkflow) => {
      const nextIndex = currentWorkflow.draftVersion.graph.nodes.length;
      const nextNode = {
        id: createClientId("node"),
        type: definition.type,
        label: definition.title,
        position: {
          x: (nextIndex % 2) * 240,
          y: Math.floor(nextIndex / 2) * 120,
        },
        config: {},
      };

      return {
        ...currentWorkflow,
        updatedAt: new Date().toISOString(),
        draftVersion: {
          ...currentWorkflow.draftVersion,
          graph: {
            ...currentWorkflow.draftVersion.graph,
            nodes: [...currentWorkflow.draftVersion.graph.nodes, nextNode],
          },
        },
      };
    });
  }

  function handleUpdateNodeLabel(nodeId: string, label: string) {
    updateWorkflowDraft((currentWorkflow) => ({
      ...currentWorkflow,
      updatedAt: new Date().toISOString(),
      draftVersion: {
        ...currentWorkflow.draftVersion,
        graph: {
          ...currentWorkflow.draftVersion.graph,
          nodes: currentWorkflow.draftVersion.graph.nodes.map((node) =>
            node.id === nodeId ? { ...node, label } : node,
          ),
        },
      },
    }));
  }

  function handleRemoveNode(nodeId: string) {
    updateWorkflowDraft((currentWorkflow) => ({
      ...currentWorkflow,
      updatedAt: new Date().toISOString(),
      draftVersion: {
        ...currentWorkflow.draftVersion,
        graph: {
          nodes: currentWorkflow.draftVersion.graph.nodes.filter(
            (node) => node.id !== nodeId,
          ),
          edges: currentWorkflow.draftVersion.graph.edges.filter(
            (edge) =>
              edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
          ),
        },
      },
    }));
  }

  function handleAddEdge(
    sourceNodeId: string,
    targetNodeId: string,
    label: string,
  ) {
    updateWorkflowDraft((currentWorkflow) => ({
      ...currentWorkflow,
      updatedAt: new Date().toISOString(),
      draftVersion: {
        ...currentWorkflow.draftVersion,
        graph: {
          ...currentWorkflow.draftVersion.graph,
          edges: [
            ...currentWorkflow.draftVersion.graph.edges,
            {
              id: createClientId("edge"),
              sourceNodeId,
              targetNodeId,
              label: label.trim() ? label.trim() : null,
            },
          ],
        },
      },
    }));
  }

  function handleRemoveEdge(edgeId: string) {
    updateWorkflowDraft((currentWorkflow) => ({
      ...currentWorkflow,
      updatedAt: new Date().toISOString(),
      draftVersion: {
        ...currentWorkflow.draftVersion,
        graph: {
          ...currentWorkflow.draftVersion.graph,
          edges: currentWorkflow.draftVersion.graph.edges.filter(
            (edge) => edge.id !== edgeId,
          ),
        },
      },
    }));
  }

  async function handleSignOut() {
    if (token) {
      await request("/auth/sign-out", { method: "POST" }).catch(() => null);
    }
    clearSession();
  }

  return {
    auditLogs,
    autosaveState,
    errorMessage,
    handleAddEdge,
    handleAddNode,
    handleCreateProject,
    handleCreateWorkflow,
    handleCreateWorkspace,
    handleRemoveEdge,
    handleRemoveNode,
    handleSelectWorkflow,
    handleSignOut,
    handleUpdateNodeLabel,
    handleWorkflowDescriptionChange,
    handleWorkflowNameChange,
    isBusy,
    isLoadingSession: Boolean(token && !user),
    isSavingDraft,
    nodeDefinitions,
    projectDescription,
    projectName,
    projects,
    selectedProject,
    selectedProjectId,
    selectedWorkflowId,
    selectedWorkspace,
    selectedWorkspaceId,
    setSelectedProjectId: handleSelectProject,
    setSelectedWorkspaceId: handleSelectWorkspace,
    setProjectDescription,
    setProjectName,
    setWorkflowDescription,
    setWorkflowName,
    setWorkspaceName,
    user,
    workflowDescription,
    workflowDraft,
    workflowName,
    workflows,
    workspaceName,
    workspaces,
  };
}
