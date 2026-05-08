# FORGE Project Structure

## Project Overview

FORGE is a visual workflow builder for designing backend systems. Users authenticate, create workspaces, open a React Flow canvas, drag backend-oriented nodes, apply starter templates, validate connections, persist workflow state through PostgreSQL/TypeORM, and generate deterministic backend artifacts.

The current application is split into:

- `frontend/` - Next.js App Router UI for login, workspace dashboard, profile, and workflow canvas.
- `backend/` - NestJS API for auth/session handling, workspaces/projects/workflows, templates, execution, audit logs, persistence, and code generation.
- `Forge.md` - high-level production build plan and long-term product goals.

## Tech Stack

- Frontend: Next.js App Router, React 19, TypeScript, Tailwind CSS, Zustand, React Flow, lucide-react.
- Backend: NestJS, TypeScript, TypeORM, PostgreSQL, Jest.
- Workflow canvas: `@xyflow/react`.
- Validation: custom server-side request validation helpers and graph validation utilities.
- Code generation: deterministic template-based generation. GenAI is not used.
- Persistence: PostgreSQL tables managed by TypeORM migrations, with JSONB snapshots for graph-shaped workflow data.
- Runtime queue support: BullMQ/ioredis are installed; the default local queue driver is in-memory unless configured otherwise.

## Folder Structure

```txt
frontend/
  src/app/                       Next.js routes
    page.tsx                     Login entry page
    login/page.tsx               Login route
    dashboard/page.tsx           Workspace dashboard route
    profile/page.tsx             Read-only account/profile route
    workspace/[workspaceId]/     Workflow editor route

  src/components/
    auth/                        Login UI
    common/                      Shared visual pieces such as BrandMark
    profile/                     Profile/account page UI
    ui/                          Small reusable UI primitives

  src/features/
    workspace/                   Workspace dashboard types and UI
    workflow/                    Canvas, node library, templates, artifacts, validation helpers

  src/stores/                    Zustand stores for UI/workspace/workflow canvas state
  src/lib/                       API client, auth session helper, local token storage
  src/types/                     Shared frontend API/domain types

backend/
  src/auth/                      Auth controller/service/guard
  src/audit/                     Audit log API surface
  src/common/                    Request context and validation helpers
  src/database/                  TypeORM config, entities, migrations, template seed scripts
  src/identity/                  Domain types and store facade
    stores/                      Domain-focused in-memory stores and PostgreSQL loader/persister
    stores/persistence/          PostgreSQL state hydration and persistence
    stores/utils/                Password, date, slug, and UUID helpers
  src/projects/                  Project lookup API
  src/workspaces/                Workspace and project management API
  src/workflows/                 Node registry, compiler, graph validation, execution, templates, codegen
```

## Important Files

- `frontend/src/lib/apiClient.ts` - typed fetch wrapper for the backend API.
- `frontend/src/lib/sessionStorage.ts` - local session token storage.
- `frontend/src/lib/authSession.ts` - shared logout helper.
- `frontend/src/features/workflow/components/workspaceEditor.tsx` - main authenticated canvas shell.
- `frontend/src/features/workflow/components/workflowCanvas.tsx` - React Flow canvas and connection handling.
- `frontend/src/features/workflow/components/nodeLibrarySidebar.tsx` - node library and template cards.
- `frontend/src/features/workflow/components/artifactDrawer.tsx` - workflow definition/backend module export UI and ZIP download.
- `frontend/src/features/workflow/connectionRules.ts` - frontend node compatibility rules.
- `frontend/src/features/workflow/workflowTemplates.ts` - client fallback templates.
- `backend/src/app.module.ts` - Nest module wiring.
- `backend/src/database/migrations/1788770000000-CreateForgePersistenceTables.ts` - PostgreSQL schema migration.
- `backend/src/database/seeds/system-workflow-templates.ts` - system template definitions.
- `backend/src/identity/in-memory-store.service.ts` - backward-compatible store token.
- `backend/src/identity/stores/forge-store.facade.ts` - facade delegating to domain stores.
- `backend/src/identity/stores/persistence/postgres-state-loader.service.ts` - hydrates in-memory state from PostgreSQL.
- `backend/src/identity/stores/persistence/postgres-state-persister.service.ts` - persists state back to PostgreSQL.
- `backend/src/workflows/workflow-code-generator.ts` - deterministic backend module/workflow definition generator.
- `backend/src/workflows/workflow-artifact-generator.ts` - generated artifacts for published project workflows.
- `backend/.env.example` and `frontend/.env.example` - local environment templates.

## Data Model

The intended hierarchy is:

```txt
User
  Workspace
    Project
      Workflow
        WorkflowVersion
```

Additional records:

- `Session` stores active auth sessions.
- `WorkflowTemplate` stores reusable starter templates.
- `WorkflowExecution`, `WorkflowExecutionStep`, and `WorkflowExecutionLog` record runtime execution state.
- `GeneratedArtifact` stores generated code/metadata artifacts for workflow versions.
- `AuditLog` records important auth, workspace, project, workflow, publish, rollback, and artifact actions.

Workflow graph snapshots are stored as JSONB arrays on `WorkflowVersion` (`nodesJson`, `edgesJson`, and optional `viewportJson`). This matches React Flow's graph-shaped data and keeps versioning simple.

## Persistence Flow

The backend currently has two persistence surfaces:

- Domain store facade used by the project/workflow APIs under `projects/:projectId/workflows`.
- Direct TypeORM workflow persistence used by the workspace canvas APIs under `workspaces/:workspaceId/workflows` and `workflows/:workflowId/save`.

PostgreSQL entities live in `backend/src/database/entities/`. The schema migration lives in `backend/src/database/migrations/`.

On startup, `PostgresStateLoaderService` runs migrations when configured and hydrates `ForgeMemoryState`. Mutating domain-store actions schedule persistence through `PostgresStatePersisterService`.

The workflow/project foreign-key issue was fixed by:

- creating a real default project for workflows created through the workspace canvas API;
- validating project references before persisting in-memory workflows;
- saving `project_id = null` for legacy workspace-scoped workflows whose stored project ID is actually a workspace ID or otherwise missing;
- skipping invalid workflow versions when their workflow was not persisted.

Foreign key constraints remain enabled.

## Code Generation

FORGE has two export modes:

- **Export Workflow Definition** - emits workflow metadata files such as `workflow.definition.ts` and `workflow.json`.
- **Generate Backend Module** - emits deterministic NestJS module files with controllers, services, DTOs, providers, types, README, and `.env.example` where supported.

Templates such as OTP Auth and Payment Webhook are quick starts, not the generator architecture. The generator is still based on known node types, workflow compilation, deterministic templates, and warning artifacts for unsupported or generic workflows.

Generated modules intentionally use placeholders for secrets and provider boundaries. Review generated `README.md`, `.env.example`, and `GENERATION_WARNINGS.md` before production use.

## Local Development

Install dependencies in each package:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Backend setup:

```bash
cd backend
cp .env.example .env
npm run migration:run
npm run seed:templates
npm run start:dev
```

Frontend setup:

```bash
cd frontend
cp .env.example .env.local
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3000/v1` if running backend on the default Nest port. If both apps run locally at once, use separate ports and set `NEXT_PUBLIC_API_URL` accordingly.

## Checks

Backend scripts:

```bash
npm run lint
npm run build
npm test
```

Frontend scripts:

```bash
npm run lint
npm run build
```

The backend also includes:

```bash
npm run migration:run
npm run migration:revert
npm run seed:templates
```

## Known Limitations / TODOs

- Some generated providers are demo integration boundaries and must be replaced with real SMS/email/payment/database providers for production.
- OTP generated modules use in-memory storage as a development example; Redis or another shared TTL store is recommended for production.
- Redis/BullMQ dependencies exist, but local execution defaults can still use in-memory behavior.
- The workspace canvas API supports workspace-oriented workflows and now creates a default backing project. A future cleanup should unify the workspace-canvas API and project-first workflow API into one public workflow API.
- Advanced forge.md goals such as RBAC beyond owner membership, credential vaulting, queue dashboards, analytics dashboards, and production incident runbooks are not fully implemented in this codebase yet.
- The root `Forge.md` is aspirational and includes long-term phases beyond the current app.
