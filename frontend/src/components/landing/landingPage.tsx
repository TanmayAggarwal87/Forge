import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Braces,
  CheckCircle2,
  Code2,
  FileCode2,
  GitBranch,
  Layers3,
  Network,
  Rocket,
  Route,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/common/themeToggle";

const productCards: FeatureCard[] = [
  {
    title: "Drag backend nodes",
    description: "Compose triggers, auth, database, logic, and response steps visually.",
    icon: Boxes,
  },
  {
    title: "Connect workflows",
    description: "Model execution paths with validated edges and readable graph structure.",
    icon: GitBranch,
  },
  {
    title: "Generate modules",
    description: "Export deterministic NestJS module files instead of one-off snippets.",
    icon: FileCode2,
  },
  {
    title: "Export real code",
    description: "Inspect backend files, README notes, env placeholders, and workflow metadata.",
    icon: Code2,
  },
  {
    title: "Manage workspaces",
    description: "Keep projects, drafts, templates, versions, artifacts, and logs organized.",
    icon: Layers3,
  },
];

const developerFeatures: FeatureCard[] = [
  {
    title: "Visual backend architecture",
    description: "Design systems as graph-shaped backend plans your team can inspect.",
    icon: Workflow,
  },
  {
    title: "Prebuilt production nodes",
    description: "Use structured nodes for auth, integrations, database actions, and responses.",
    icon: Boxes,
  },
  {
    title: "Clean code generation",
    description: "Generate separated controllers, services, DTOs, providers, and docs.",
    icon: Braces,
  },
  {
    title: "Workspace-based projects",
    description: "Group workflows by product area and keep state versioned.",
    icon: Layers3,
  },
  {
    title: "Safe exportable modules",
    description: "Use deterministic templates with explicit secret placeholders.",
    icon: ShieldCheck,
  },
  {
    title: "Developer configuration",
    description: "Tune node configs directly without hiding the backend contract.",
    icon: Route,
  },
];

const templateCards = [
  {
    name: "OTP Authentication Flow",
    nodes: ["HTTP", "OTP", "SMS", "JWT"],
    accent: "Auth",
  },
  {
    name: "Email Notification System",
    nodes: ["Trigger", "Template", "Email"],
    accent: "Comms",
  },
  {
    name: "Payment Webhook Handler",
    nodes: ["Webhook", "Verify", "DB", "Email"],
    accent: "Webhooks",
  },
  {
    name: "User Onboarding API",
    nodes: ["HTTP", "DB", "Email", "Delay"],
    accent: "Lifecycle",
  },
  {
    name: "Admin Approval Workflow",
    nodes: ["HTTP", "Branch", "Review", "Deploy"],
    accent: "Ops",
  },
];

const safetyItems = [
  "No arbitrary shell execution",
  "Validated node configs",
  "Safe templates",
  "Secret management boundaries",
  "Audit logs",
  "Controlled code export",
];

type FeatureCard = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f8] text-slate-950 dark:bg-stone-950 dark:text-stone-50">
      <LandingNav />
      <HeroSection />
      <WhatForgeDoes />
      <BuilderPreview />
      <DeveloperFeatures />
      <TemplatesSection />
      <SafetySection />
      <DocsPricingSection />
      <AvoidSection />
      <FinalCta />
    </main>
  );
}

function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-stone-950/82 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md border border-amber-400/30 bg-amber-500 text-stone-950 shadow-[0_0_24px_rgba(245,158,11,0.24)]">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-100">
            FORGE
          </span>
        </Link>

        <div className="hidden items-center gap-7 text-sm text-stone-400 md:flex">
          <a href="#product" className="transition hover:text-amber-300">
            Product
          </a>
          <a href="#templates" className="transition hover:text-amber-300">
            Templates
          </a>
          <a href="#docs" className="transition hover:text-amber-300">
            Docs
          </a>
          <a href="#pricing" className="transition hover:text-amber-300">
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-stone-300 transition hover:text-white sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-md bg-amber-500 px-4 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            Sign Up
          </Link>
        </div>
      </nav>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-stone-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(245,158,11,0.18),transparent_30%),radial-gradient(circle_at_72%_22%,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,#0c0a09_0%,#11100e_54%,#0c0a09_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
            <Zap className="size-3.5" />
            Systems-designed backend
          </div>
          <h1 className="mt-7 max-w-3xl text-6xl font-semibold text-stone-50 sm:text-7xl lg:text-8xl">
            Ready to Forge?
          </h1>
          <p className="mt-6 max-w-xl text-xl leading-8 text-stone-300">
            Your systems-designed backend.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-md bg-amber-500 px-5 text-sm font-semibold text-stone-950 shadow-[0_0_34px_rgba(245,158,11,0.22)] transition hover:bg-amber-400"
            >
              Start Building
            </Link>
            <a
              href="#builder-preview"
              className="inline-flex h-11 items-center rounded-md border border-stone-700 bg-white/5 px-5 text-sm font-semibold text-stone-100 transition hover:border-amber-400/60 hover:text-amber-200"
            >
              View Demo
            </a>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-stone-400">
            <Link href="/login" className="transition hover:text-stone-100">
              Login
            </Link>
            <Link href="/login" className="inline-flex items-center gap-1 text-amber-300 transition hover:text-amber-200">
              Sign up <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3 text-xs text-stone-400">
            <HeroStat label="Nodes" value="Typed" />
            <HeroStat label="Exports" value="NestJS" />
            <HeroStat label="Runtime" value="Audited" />
          </div>
        </div>

        <ForgeGodIllustration />
      </div>
    </section>
  );
}

function ForgeGodIllustration() {
  const figureDots = [
    [188, 58, 2.8],
    [205, 62, 2.4],
    [175, 74, 2.2],
    [213, 78, 2.2],
    [166, 94, 2.3],
    [198, 94, 3],
    [229, 98, 2.2],
    [150, 116, 2.1],
    [177, 118, 2.8],
    [209, 120, 2.5],
    [238, 124, 2],
    [132, 143, 2],
    [161, 143, 2.5],
    [192, 146, 3.1],
    [224, 149, 2.6],
    [253, 153, 2],
    [116, 174, 1.9],
    [150, 172, 2.3],
    [181, 176, 2.8],
    [214, 178, 2.6],
    [249, 183, 2.1],
    [103, 206, 1.8],
    [139, 205, 2.2],
    [174, 210, 2.4],
    [213, 212, 2.5],
    [252, 219, 2],
    [142, 242, 2],
    [177, 247, 2.2],
    [214, 249, 2],
    [101, 285, 1.8],
    [137, 282, 2.1],
    [174, 287, 2.2],
    [216, 286, 2.1],
    [257, 291, 1.8],
    [126, 324, 1.9],
    [166, 329, 2],
    [210, 329, 2],
    [251, 331, 1.8],
  ];
  const emberDots = [
    [336, 196, 2.2],
    [361, 176, 1.8],
    [387, 154, 1.4],
    [405, 200, 1.7],
    [375, 227, 2],
    [430, 178, 1.4],
    [455, 214, 1.2],
    [348, 252, 1.6],
    [419, 248, 1.8],
  ];

  return (
    <div className="relative min-h-[520px] overflow-hidden rounded-lg border border-white/10 bg-black/30 shadow-2xl shadow-black/40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_64%_44%,rgba(245,158,11,0.16),transparent_20%),radial-gradient(circle_at_44%_42%,rgba(255,255,255,0.09),transparent_34%)]" />
      <svg
        viewBox="0 0 560 520"
        role="img"
        aria-label="Abstract dotted blacksmith figure at an anvil"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <filter id="ember-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="dot-grid" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="rgba(255,255,255,0.12)" />
          </pattern>
        </defs>
        <rect width="560" height="520" fill="url(#dot-grid)" />

        <path
          d="M164 88 C202 34 262 71 238 126 C221 160 171 148 164 88Z"
          fill="none"
          stroke="rgba(245,245,244,0.55)"
          strokeWidth="2"
          strokeDasharray="3 12"
        />
        <path
          d="M151 139 C119 176 100 224 104 292 M226 144 C263 188 271 235 253 303"
          fill="none"
          stroke="rgba(245,245,244,0.32)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="3 13"
        />
        <path
          d="M132 160 C178 194 233 206 296 194"
          fill="none"
          stroke="rgba(245,245,244,0.42)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="4 12"
        />
        <path
          d="M281 188 L364 104"
          stroke="rgba(245,245,244,0.52)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="2 12"
        />
        <path
          d="M328 92 L410 62"
          stroke="rgba(245,245,244,0.28)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M294 296 H438 L412 341 H322 Z"
          fill="rgba(245,245,244,0.08)"
          stroke="rgba(245,245,244,0.38)"
          strokeWidth="2"
        />
        <path
          d="M344 341 H398 L424 428 H314 Z"
          fill="rgba(245,245,244,0.05)"
          stroke="rgba(245,245,244,0.22)"
          strokeWidth="2"
        />
        <path
          d="M108 368 C177 398 302 401 419 372"
          fill="none"
          stroke="rgba(245,245,244,0.16)"
          strokeWidth="2"
          strokeDasharray="6 14"
        />

        {figureDots.map(([cx, cy, r]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="rgba(245,245,244,0.86)"
          />
        ))}
        {emberDots.map(([cx, cy, r], index) => (
          <circle
            key={`${cx}-${cy}`}
            className="forge-ember"
            cx={cx}
            cy={cy}
            r={r}
            fill="#f97316"
            filter="url(#ember-glow)"
            style={{ animationDelay: `${index * 140}ms` }}
          />
        ))}
        <path
          d="M318 222 C352 207 384 207 418 218"
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 10"
          filter="url(#ember-glow)"
        />
      </svg>
      <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs uppercase tracking-[0.18em] text-stone-500">
        <span>CSS / SVG figure</span>
        <span className="text-amber-300">No stock artwork</span>
      </div>
    </div>
  );
}

function WhatForgeDoes() {
  return (
    <section id="product" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionHeader
        eyebrow="What FORGE Does"
        title="Turn backend architecture into a visual system."
        description="FORGE gives developers a structured canvas for backend workflows without hiding the generated code."
      />
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {productCards.map((card) => (
          <FeatureTile key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}

function BuilderPreview() {
  const nodes = [
    ["HTTP Trigger", "Trigger", "left-[34%] top-[18%]"],
    ["Generate OTP", "Auth", "left-[53%] top-[24%]"],
    ["Send Email", "Comms", "left-[67%] top-[46%]"],
    ["Database Write", "DB", "left-[41%] top-[57%]"],
    ["Deploy API", "Ship", "left-[62%] top-[74%]"],
  ];

  return (
    <section id="builder-preview" className="bg-stone-950 py-20 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Visual Workflow Builder Preview"
          title="A canvas that looks like the backend it creates."
          description="Node library, graph editor, configuration panel, validation state, and code export in one focused workspace."
          dark
        />
        <div className="mt-10 overflow-hidden rounded-lg border border-stone-800 bg-[#0c0a09] shadow-2xl shadow-black/30">
          <div className="flex h-12 items-center justify-between border-b border-stone-800 bg-stone-900/80 px-4">
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <span className="size-2 rounded-full bg-red-500" />
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="ml-3 font-medium text-stone-300">FORGE Workspace</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <span>Saved</span>
              <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-300">
                Generate Backend Code
              </span>
            </div>
          </div>

          <div className="grid min-h-[520px] lg:grid-cols-[220px_minmax(0,1fr)_260px]">
            <aside className="border-r border-stone-800 bg-stone-950/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                Node Library
              </p>
              <div className="mt-4 grid gap-2">
                {["Triggers", "Authentication", "Communication", "Database"].map((item) => (
                  <div key={item} className="rounded-md border border-stone-800 bg-stone-900 px-3 py-3 text-sm text-stone-300">
                    {item}
                  </div>
                ))}
              </div>
            </aside>

            <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(circle_at_45%_38%,rgba(245,158,11,0.09),transparent_24%),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:auto,32px_32px,32px_32px]">
              <svg className="absolute inset-0 h-full w-full">
                <path
                  d="M295 105 C370 110 410 140 466 205 S560 297 438 362"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="0.78"
                />
                <path
                  d="M356 152 C314 240 302 276 438 362"
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.55"
                />
              </svg>
              {nodes.map(([name, badge, position]) => (
                <div
                  key={name}
                  className={`absolute ${position} w-44 rounded-md border border-stone-700 bg-stone-900 p-3 shadow-xl shadow-black/20`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                    {badge}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-stone-50">{name}</p>
                  <div className="mt-3 h-1 rounded bg-stone-800">
                    <div className="h-1 w-2/3 rounded bg-amber-500" />
                  </div>
                </div>
              ))}
            </div>

            <aside className="border-l border-stone-800 bg-stone-950/80 p-4 lg:border-l">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                Configuration
              </p>
              <div className="mt-4 grid gap-3">
                <PreviewField label="Route" value="/auth/request-otp" />
                <PreviewField label="Method" value="POST" />
                <PreviewField label="Secrets" value="{{JWT_SECRET}}" />
                <PreviewField label="Export" value="NestJS Module" />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeveloperFeatures() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionHeader
        eyebrow="Why Developers Use FORGE"
        title="Visual when it helps. Explicit when it matters."
        description="FORGE keeps backend generation inspectable, versioned, and controlled."
      />
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {developerFeatures.map((card) => (
          <FeatureTile key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}

function TemplatesSection() {
  return (
    <section id="templates" className="border-y border-slate-200 bg-white py-20 dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Templates"
          title="Start from backend patterns developers already ship."
          description="Templates are customizable workflow graphs, not locked demos."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {templateCards.map((template) => (
            <article
              key={template.name}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-stone-800 dark:bg-stone-950/70"
            >
              <div className="mb-5 inline-flex rounded bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                {template.accent}
              </div>
              <h3 className="text-sm font-semibold">{template.name}</h3>
              <div className="mt-5 grid gap-2">
                {template.nodes.map((node, index) => (
                  <div key={`${template.name}-${node}`} className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded border border-slate-200 bg-white text-[10px] text-slate-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
                      {index + 1}
                    </span>
                    <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-900">
                      {node}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SafetySection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
            Security / Safety
          </p>
          <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
            No unsafe magic in the generation path.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-600 dark:text-stone-300">
            FORGE avoids arbitrary code execution and keeps generated modules explicit, reviewed, and controlled.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {safetyItems.map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <CheckCircle2 className="size-5 text-amber-600 dark:text-amber-300" />
              <span className="text-sm font-medium">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DocsPricingSection() {
  return (
    <section id="docs" className="bg-slate-950 py-16 text-white dark:bg-black">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-2" id="pricing">
        <article className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <Network className="size-6 text-amber-300" />
          <h3 className="mt-5 text-xl font-semibold">Docs for generated systems</h3>
          <p className="mt-3 text-sm leading-6 text-stone-400">
            Every generated backend module includes README guidance, env placeholders, and integration notes.
          </p>
        </article>
        <article className="rounded-lg border border-amber-400/25 bg-amber-500/[0.08] p-6">
          <Rocket className="size-6 text-amber-300" />
          <h3 className="mt-5 text-xl font-semibold">Pricing-ready foundation</h3>
          <p className="mt-3 text-sm leading-6 text-stone-400">
            Built for teams, workspaces, versions, exports, and audit trails. Billing can be layered on later.
          </p>
        </article>
      </div>
    </section>
  );
}

function AvoidSection() {
  return (
    <section className="border-y border-slate-200 bg-white py-16 dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-6 rounded-lg border border-slate-200 bg-slate-50 p-6 dark:border-stone-800 dark:bg-stone-950 md:grid-cols-[0.35fr_0.65fr] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
              Avoid
            </p>
            <h2 className="mt-3 text-2xl font-semibold">Premium mythic, not fantasy art.</h2>
          </div>
          <p className="text-sm leading-7 text-slate-600 dark:text-stone-300">
            Avoid using stock images, pasted AI images, fantasy paintings, cartoon gods, random 3D renders, or cheap hero artwork. The mythic figure is created through CSS/SVG/particles/dots/halftone-style frontend visuals.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-stone-950 px-4 py-20 text-white sm:px-6">
      <div className="mx-auto max-w-5xl rounded-lg border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.18),transparent_32%),#0c0a09] p-8 text-center sm:p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
          Build visually. Export deliberately.
        </p>
        <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
          Forge your next backend visually.
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-md bg-amber-500 px-5 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            Start Building
          </Link>
          <a
            href="#templates"
            className="inline-flex h-11 items-center rounded-md border border-stone-700 bg-white/5 px-5 text-sm font-semibold text-stone-100 transition hover:border-amber-400/60 hover:text-amber-200"
          >
            Explore Templates
          </a>
        </div>
      </div>
    </section>
  );
}

function FeatureTile({ title, description, icon: Icon }: FeatureCard) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-stone-800 dark:bg-stone-900">
      <div className="grid size-10 place-items-center rounded-md bg-slate-950 text-white dark:bg-amber-500 dark:text-stone-950">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-stone-300">
        {description}
      </p>
    </article>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-100">{value}</p>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-800 bg-stone-900 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 truncate text-sm text-stone-100">{value}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
        {eyebrow}
      </p>
      <h2 className={`mt-4 text-4xl font-semibold sm:text-5xl ${dark ? "text-white" : ""}`}>
        {title}
      </h2>
      <p className={`mt-5 text-base leading-7 ${dark ? "text-stone-400" : "text-slate-600 dark:text-stone-300"}`}>
        {description}
      </p>
    </div>
  );
}
