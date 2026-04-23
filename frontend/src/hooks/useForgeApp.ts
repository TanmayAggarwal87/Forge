"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, getErrorMessage } from "@/lib/apiClient";
import {
  clearStoredSessionToken,
  getStoredSessionToken,
} from "@/lib/sessionStorage";
import type {
  AuditLog,
  Project,
  SessionUser,
  Workspace,
} from "@/types/domainTypes";

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
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [workspaceName, setWorkspaceName] = useState("Core Platform");
  const [projectName, setProjectName] = useState("Workflow API");
  const [projectDescription, setProjectDescription] = useState(
    "Backend workflow builder foundation",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      null,
    [selectedWorkspaceId, workspaces],
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

  const clearSession = useCallback(
    function clearSession() {
      clearStoredSessionToken();
      setToken(null);
      setUser(null);
      setWorkspaces([]);
      setProjects([]);
      setAuditLogs([]);
      setSelectedWorkspaceId(null);
      router.replace("/login");
    },
    [router],
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

  const loadSession = useCallback(
    async function loadSession(activeToken: string) {
      try {
        const session = await request<{ user: SessionUser }>(
          "/auth/session",
          {},
          activeToken,
        );
        setUser(session.user);
        await loadWorkspaces(activeToken);
      } catch (error) {
        clearSession();
        setErrorMessage(getErrorMessage(error));
      }
    },
    [clearSession, loadWorkspaces, request],
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
      await request<{ project: Project }>(
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
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    if (token) {
      await request("/auth/sign-out", { method: "POST" }).catch(() => null);
    }
    clearSession();
  }

  return {
    auditLogs,
    errorMessage,
    handleCreateProject,
    handleCreateWorkspace,
    handleSignOut,
    isBusy,
    isLoadingSession: Boolean(token && !user),
    projectDescription,
    projectName,
    projects,
    selectedWorkspace,
    selectedWorkspaceId,
    setProjectDescription,
    setProjectName,
    setSelectedWorkspaceId,
    setWorkspaceName,
    user,
    workspaceName,
    workspaces,
  };
}
