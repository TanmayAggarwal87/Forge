"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeMouseHandler,
  type NodeChange,
  type NodeTypes,
  type OnMove,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasToolbar } from "@/features/workflow/components/canvasToolbar";
import { WorkflowNode } from "@/features/workflow/components/workflowNode";
import { buildNode, defaultViewport } from "@/features/workflow/utils";
import { useUiStore } from "@/stores/uiStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNodeType,
} from "@/features/workflow/types";

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode,
};

type WorkflowCanvasProps = {
  workspaceId: string;
  workflow: WorkflowDocument;
};

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner({ workspaceId, workflow }: WorkflowCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactFlow = useReactFlow();
  const flowViewport = useMemo(() => workflow.viewport ?? defaultViewport, [workflow.viewport]);
  const [currentZoom, setCurrentZoom] = useState(() => flowViewport.zoom ?? 1);
  const [nodes, setNodes, onNodesChange] = useNodesState(workflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow.edges);

  const syncSelection = useUiStore((state) => state.syncSelection);
  const setSelectedNodeId = useUiStore((state) => state.setSelectedNodeId);
  const setDragNodeType = useUiStore((state) => state.setDragNodeType);

  const addConnection = useWorkflowStore((state) => state.addConnection);
  const reconnectConnection = useWorkflowStore((state) => state.reconnectConnection);
  const persistNodes = useWorkflowStore((state) => state.setNodes);
  const persistEdges = useWorkflowStore((state) => state.setEdges);
  const setViewport = useWorkflowStore((state) => state.setViewport);

  useEffect(() => {
    reactFlow.setViewport(flowViewport, { duration: 0 });
  }, [flowViewport, reactFlow]);

  useEffect(() => {
    setNodes(workflow.nodes);
  }, [setNodes, workflow.nodes]);

  useEffect(() => {
    setEdges(workflow.edges);
  }, [setEdges, workflow.edges]);

  const handleConnect = (connection: Connection) => {
    const nextEdge: WorkflowEdge = {
      ...connection,
      id: crypto.randomUUID(),
      type: "smoothstep",
      animated: false,
    };

    setEdges((currentEdges) => addEdge(nextEdge, currentEdges));
    addConnection(workspaceId, nextEdge);
  };

  const handleDropNode = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const nodeType = event.dataTransfer.getData("application/forge-node") as WorkflowNodeType;
    if (!nodeType) {
      return;
    }

    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const nextNodes = [...nodes, buildNode(nodeType, position)];
    setNodes(nextNodes);
    persistNodes(workspaceId, nextNodes);
    setDragNodeType(null);
  };

  const handleMoveEnd: OnMove = (_, viewport) => {
    setViewport(workspaceId, viewport);
    setCurrentZoom(viewport.zoom);
  };

  const handleNodeDragStop: NodeMouseHandler = (_, node) => {
    const nextNodes = nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, position: node.position } : candidate,
    );
    setNodes(nextNodes);
    persistNodes(workspaceId, nextNodes);
  };

  const handleNodesChange = (changes: NodeChange[]) => {
    onNodesChange(changes);

    const shouldPersist = changes.some((change) =>
      ["remove", "add", "replace"].includes(change.type),
    );

    if (!shouldPersist) {
      return;
    }

    const nextNodes = applyNodeChanges(changes, nodes);
    persistNodes(workspaceId, nextNodes);
  };

  const handleEdgesChange = (changes: EdgeChange[]) => {
    onEdgesChange(changes);

    const shouldPersist = changes.some((change) =>
      ["remove", "add", "replace"].includes(change.type),
    );

    if (!shouldPersist) {
      return;
    }

    const nextEdges = applyEdgeChanges(changes, edges);
    persistEdges(workspaceId, nextEdges);
  };

  const selectedNodeCount = nodes.filter((node) => node.selected).length;

  return (
    <div
      ref={containerRef}
      className="relative h-full bg-[#fbfbfc]"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDropNode}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultViewport={defaultViewport}
        fitView={false}
        minZoom={0.35}
        maxZoom={2}
        snapToGrid
        snapGrid={[24, 24]}
        selectionMode={SelectionMode.Partial}
        panOnScroll={false}
        panOnDrag={[1, 2]}
        zoomOnScroll={true}
        preventScrolling={false}
        selectionOnDrag
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Meta", "Control"]}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onSelectionChange={({ nodes, edges }) => syncSelection(nodes, edges)}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => setSelectedNodeId(null)}
        onMove={(_, viewport) => setCurrentZoom(viewport.zoom)}
        onMoveEnd={handleMoveEnd}
        onReconnect={(oldEdge, newConnection) => {
          const nextEdges = edges.map((edge) =>
            edge.id === oldEdge.id
              ? {
                  ...edge,
                  ...newConnection,
                }
              : edge,
          );
          setEdges(nextEdges);
          reconnectConnection(workspaceId, oldEdge, newConnection);
        }}
        onNodesDelete={() => setSelectedNodeId(null)}
        className="workflow-canvas"
      >
        <Background gap={24} size={1} color="#e2e8f0" />
        <MiniMap
          pannable
          zoomable
          className="!bottom-4 !left-4 !border !border-slate-200 !bg-white"
          nodeColor="#0f172a"
          maskColor="rgba(148, 163, 184, 0.08)"
        />
        <Controls position="top-right" showInteractive={false} className="!rounded-md !border !border-slate-200 !bg-white" />
        <Panel position="top-left">
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
            {selectedNodeCount > 0
              ? `${selectedNodeCount} node${selectedNodeCount === 1 ? "" : "s"} selected`
              : "Drop a node here to start the workflow"}
          </div>
        </Panel>

        <CanvasToolbar
          zoomLabel={`${Math.round(currentZoom * 100)}%`}
          zoomIn={() => reactFlow.zoomIn()}
          zoomOut={() => reactFlow.zoomOut()}
        />
      </ReactFlow>

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/90 px-6 py-5 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-900">Blank canvas</p>
            <p className="mt-2 text-xs text-slate-500">
              Drag a node from the library to begin building the workflow.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
