# Forge
A professional-grade visual workflow engine and development platform for building, executing, and managing complex automation artifacts.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

Forge is a comprehensive Full-Stack solution designed to bridge the gap between visual logic design and technical execution. It provides a robust workspace-based environment where users can draft workflows, manage versions, and generate production-ready artifacts through an intuitive node-based interface.

---

## Visual Diagrams

### System Architecture
```mermaid
graph TD
    Client[Browser / Next.js Frontend]
    API[NestJS Gateway]
    Auth[Auth Guard & Session Management]
    WorkflowEngine[Workflow Compiler & Executor]
    Persistence[PostgreSQL Database]
    StateService[In-Memory State Service]

    Client -->|REST API| API
    API --> Auth
    API --> WorkflowEngine
    WorkflowEngine --> StateService
    StateService -->|Sync| Persistence
    API --> Persistence
```

### Entity Relationship Diagram
```mermaid
erDiagram
    USER ||--o{ WORKSPACE : owns
    USER ||--o{ SESSION : maintains
    WORKSPACE ||--o{ PROJECT : contains
    PROJECT ||--o{ WORKFLOW : includes
    WORKFLOW ||--o{ WORKFLOW_VERSION : has
    WORKFLOW_VERSION ||--o{ WORKFLOW_EXECUTION : generates
    WORKFLOW_EXECUTION ||--o{ WORKFLOW_EXECUTION_STEP : records
    WORKFLOW_EXECUTION ||--o{ ARTIFACT : produces
```

### Workflow Execution Flow
```mermaid
sequenceDiagram
    participant U as User
    participant C as Canvas (Frontend)
    participant B as Backend Service
    participant E as Execution Engine
    participant D as Database

    U->>C: Trigger Execute
    C->>B: POST /workflows/:id/execute
    B->>B: Validate Graph (No Cycles)
    B->>B: Compile Nodes to Executable Script
    B->>E: Run Workflow Instance
    E->>D: Log Execution Steps
    E->>B: Return Artifacts
    B->>C: Push Status Update
```

---

## Problem Statement
Developing automated workflows often involves a fragmented process of writing glue code, managing version control manually, and struggling with visibility into execution states. Organizations lack a unified tool that allows both technical and non-technical stakeholders to collaborate on logic without sacrificing the rigor of professional software development practices like auditing and persistence.

---

## Solution Overview
Forge provides a high-fidelity visual workspace where logic is represented as a Directed Acyclic Graph (DAG). It handles the heavy lifting of state management, graph validation, and code compilation. By treating workflows as versioned entities, Forge ensures that every execution is traceable, reproducible, and securely audited, effectively turning visual diagrams into functional software assets.

---

## Key Features
- **Visual Workflow Canvas:** Interactive node-based editor for designing complex logic flows.
- **Hierarchical Management:** Multi-tenant workspace and project structure for organizing organizational assets.
- **Robust Persistence Layer:** Dual-layer state management using in-memory stores for performance and PostgreSQL for long-term durability.
- **Version Control:** Snapshotting and versioning of workflow templates to prevent breaking changes in production.
- **Audit Logging:** Comprehensive tracking of user actions and system changes for compliance.
- **Artifact Generation:** Automated production of output files and code based on workflow results.

---

## Tech Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15 | Server-side rendering and routing for the dashboard and editor. |
| **Backend** | NestJS | Modular architecture for scalable API development. |
| **Database** | PostgreSQL | Relational storage for users, workflows, and execution logs. |
| **ORM** | TypeORM | Database modeling and migration management. |
| **State Mgmt** | Zustand | Lightweight client-side state for the workflow canvas. |
| **Styling** | Tailwind CSS | Responsive and maintainable UI components. |
| **Validation** | Class-Validator | Strict schema enforcement for API requests. |

---

## Project Structure

```text
forge/
├── backend/                # NestJS Application
│   ├── src/
│   │   ├── auth/           # Identity & Access Management
│   │   ├── database/       # TypeORM Entities & Migrations
│   │   ├── identity/       # State Persisters & Facades
│   │   ├── projects/       # Project Management Logic
│   │   ├── workflows/      # Compiler & Execution Engine
│   │   └── workspaces/     # Multi-tenancy Logic
├── frontend/               # Next.js Application
│   ├── src/
│   │   ├── app/            # Next.js App Router (Pages)
│   │   ├── components/     # UI & Shared Components
│   │   ├── features/       # Workflow & Workspace Specific Logic
│   │   ├── lib/            # API Clients & Utils
│   │   └── stores/         # Zustand State Management
└── PROJECT_STRUCTURE.md
```

---

## Quick Start/Installation

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- npm or yarn

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment:
   ```bash
   cp .env.example .env
   ```
4. Run migrations and start:
   ```bash
   npm run migration:run
   npm run start:dev
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## Environment Variables

| Variable | Description | Example | Required |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/forge` | Yes |
| `JWT_SECRET` | Secret key for auth tokens | `super-secret-key` | Yes |
| `PORT` | Backend server port | `3001` | No |
| `NEXT_PUBLIC_API_URL` | URL of the backend API | `http://localhost:3001` | Yes |

---

## API Endpoints

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Authenticates user and starts session | No |
| `GET` | `/workspaces` | Lists all accessible workspaces | Yes |
| `POST` | `/workflows/:id/compile` | Compiles a visual graph into code | Yes |
| `GET` | `/projects/:id` | Fetches project details and workflows | Yes |

#### Example Execution Request
```bash
curl -X POST http://localhost:3001/workflows/123/execute \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"input": {"key": "value"}}'
```

---

## Technical Challenges & Solutions

### Challenge 1: Graph Validation and Cycle Detection
**Problem:** Allowing users to connect nodes freely can lead to infinite loops if a cycle is introduced in the workflow.
**Solution:** Implemented a Directed Acyclic Graph (DAG) validator using Depth-First Search (DFS). Before any workflow is saved or executed, the backend traverses the node connections to ensure no back-references exist, maintaining execution integrity.

### Challenge 2: Dual Persistence Strategy
**Problem:** High-frequency updates to the workflow canvas (node positions, temporary config) are too heavy for direct database writes, but critical state must survive crashes.
**Solution:** Built a `ForgeStoreFacade` that manages an in-memory state for performance during active sessions and a `PostgresStatePersister` that asynchronously flushes verified state to the database at logical checkpoints.

---

## Deployment & Architecture Decisions
- **Monorepo Structure:** Chosen to keep the frontend contract in sync with backend DTOs, simplifying development speed.
- **NestJS for Backend:** Leveraged for its Dependency Injection system, which was vital for swapping between in-memory and database-backed stores during testing.
- **Next.js for Frontend:** Selected for its built-in API routing and optimized loading of heavy canvas components.

---

## Testing Approach
- **Unit Testing:** Comprehensive tests for the `WorkflowCompiler` and `GraphValidation` logic.
- **Integration Testing:** E2E tests for the authentication flow and workspace creation.
- **Snapshots:** Used for validating the output of the code generator to ensure consistent artifact production.

---

## Contributing
Contributions are what make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated. Please fork the repo, create your feature branch, and submit a pull request!

---

## License
Distributed under the MIT License. See `LICENSE` for more information.

---

Built by [Tanmay Aggarwal](https://github.com/TanmayAggarwal87)  
📧 tanmayagg.2005@gmail.com

--made by [docify](https://docify-two.vercel.app/)--
