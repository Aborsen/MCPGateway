# TrueFoundry — Competitor Analysis

**Prepared for:** Devart (AI Connectivity / MCP governance product)
**Analyst role:** Product / competitive intelligence
**Date:** 2026-06-30
**Method:** 5-phase analysis — (1) public research with source URLs, (2) live validation of the authenticated instance at `https://devart.truefoundry.cloud/`, (3) feature inventory, (4) SWOT, (5) comparison + recommendations.

> **How to read the evidence labels.** Every non-obvious claim is tagged:
> **[LIVE]** = personally verified in the devart instance · **[DOCS]** = TrueFoundry's own documentation · **[MKTG]** = marketing/landing-page claim (unverified) · **[3P]** = independent third party · **[VENDOR-FRAMED]** = competitor comparison authored by TrueFoundry (biased) · **[EST]** = estimate/inference. Full source list in §7.

---

## 1. Executive Summary

**What TrueFoundry is.** TrueFoundry (legal entity Ensemble Labs Inc., founded June 2021, ~50+ staff, San Francisco + Bengaluru) is a Kubernetes-native enterprise AI infrastructure platform. It has two halves: an **AI Gateway** (LLM Gateway + MCP Gateway + Agent Gateway + Guardrails + Prompts + Observability) and an **AI Engineering / "AI Deploy"** platform (model serving, fine-tuning, notebooks, jobs, workflows). It has raised ~**$21.3M** (Seed 2022 via Sequoia Surge; **$19M Series A Feb 2025 led by Intel Capital**) and on **24 June 2026 acquired MLOps pioneer Seldon AI** to re-absorb classic ML serving under an "agentic control plane" narrative. [3P][DOCS]

**Their strategic story (and the opening it creates).** TrueFoundry has repositioned three times: cloud-agnostic MLOps PaaS (2022–23) → LLM/AI Gateway (2025) → "agentic AI control plane" (2026). The gateway is now the flagship, and the heaviest 2025–26 engineering investment went into exactly the surface your product competes on: **MCP Gateway, guardrails, agent governance, multi-provider routing, and enterprise identity (RBAC/SCIM/SSO).** [DOCS]

**What I verified live.** Your devart instance runs **v0.154.2 on the free "Developer Plan"**. The full **AI Gateway is real and working**: a Playground, a Models catalog (OpenAI connected, `gpt-4o-mini` with editable per-token pricing), Virtual Models (routing), an **MCP Gateway with a live remote server ("doc")**, Guardrails registry, an **Agent Registry (Managed + Remote)**, a **rich AI Monitoring suite with real telemetry** (it had logged 11 gateway requests and a 21-event HTTP-405 MCP error breakdown), a Prompt Registry, and a genuinely capable **Access Management** module (Users, Teams, PATs, Virtual Accounts, Default + Custom Roles, Audit Logs). The **AI Deploy** side (`/deployments`: Services, Jobs, Notebook/SSH, Workflows, Helm, Volumes) is present but **empty/gated** because no Kubernetes compute plane or cloud integration is connected. [LIVE]

**Headline strengths.** Breadth (one control plane spanning LLM + MCP + agents + model serving), genuine enterprise governance (SOC 2 Type 2, HIPAA, GDPR; SSO/SCIM; VPC/on-prem/air-gapped self-hosting with no data egress), a deep MCP feature set (virtual MCP servers, OpenAPI→MCP, OAuth 2LO/3LO, per-user credential overrides, pre/post-tool guardrails), and unusually **transparent published pricing** ($0 / $499 / $2,999 tiers) for an enterprise vendor. [DOCS][LIVE]

**Headline weaknesses (your openings).** (1) **Operational weight** — Kubernetes-native by design; reviewers consistently cite a learning curve and the need for K8s/cloud expertise. (2) **Closed source** — no OSS data-plane tier, a real disqualifier for teams that want to own the data path (LiteLLM's home turf). (3) **Enterprise pricing opacity** — real motion is "contact sales" (~$100k/yr entry per AWS Marketplace). (4) **Thin independent validation** — ~50 G2 reviews, essentially no organic Reddit/HN discussion; review volume lags the marketing. (5) **Jack-of-all-trades risk** — three gateways + a deploy platform + a fresh acquisition to integrate; a focused MCP-governance product can out-execute on depth. [3P][VENDOR-FRAMED]

**Bottom line for your product.** If your product is the focused **MCP governance / connectivity layer** the repo describes (OAuth 2.1, per-tool/per-table permission filtering, SQL allowlisting, audit, workspace scoping), TrueFoundry's **MCP Gateway is your direct competitive surface** — and it is broad but young. The table-stakes you must match are real (OAuth inbound/outbound, virtual/curated MCP servers, observability, RBAC, SSO). Your differentiation lies in **depth of fine-grained tool/data governance, a lighter non-Kubernetes deployment, optional open-source trust, and a focused UX** — precisely where a sprawling platform is weakest.

---

## 2. Company & Product Overview

### 2.1 Company facts
| Item | Detail | Confidence |
|---|---|---|
| Legal entity / brand | Ensemble Labs Inc., dba **TrueFoundry** | [3P] confirmed |
| Founded | **June 2021** | [3P] TechCrunch |
| Founders | **Nikunj Bajaj** (CEO, ex-Meta ML lead), **Abhishek Choudhary** (CTO, ex-Meta), **Anuraag Gutgutia** (COO, ex-WorldQuant); IIT Kharagpur network | [3P] |
| HQ / team | San Francisco (355 Bryant St) + major **Bengaluru** engineering base | [3P] |
| Headcount | 16 (2022) → 45 (Feb 2025) → **~50+ (2026, pre-Seldon)** | [3P]/[EST] |
| Funding | **~$21.3M total**: $2.3M seed (Sequoia Surge, 2022); **$19M Series A, Intel Capital, Feb 6 2025** (also Peak XV, Eniac, Jump Capital). No disclosed valuation. | [3P] TechCrunch/Entrackr |
| Reported traction (Series A) | ~$1.5M+ ARR, 4× YoY customers, ~30 paid customers, 1,000+ clusters | [3P]/[MKTG] |
| Acquisition | **Seldon AI** (UK MLOps vendor, founded 2014, ~$33M raised) — announced **24 June 2026**, terms undisclosed | [3P] SiliconANGLE/Businesswire |
| Analyst recognition | Gartner **Market Guide for AI Gateways** (Representative Vendor, Oct 2025); Gartner **Hype Cycle for Platform Engineering 2026** (sample vendor: GenAI Model Routers, AI Gateways, AI Engineering); HFS "Hot Tech Vendor" (2024) | [MKTG]/[3P] |

### 2.2 Product taxonomy
TrueFoundry organizes into **two modules** (both observed in the live instance): [DOCS][LIVE]

**Module A — AI Gateway** ("control plane for agentic AI")
- **LLM Gateway** — single OpenAI-compatible endpoint to 1,000+ models / 30+ providers; routing, fallbacks, caching, budgets, rate limits, observability.
- **MCP Gateway** — centralized registration, auth, discovery, and governance of MCP servers.
- **Agent Gateway** — register/invoke agents (TrueFoundry-managed + remote), Agent Hub, Skills registry. (Launched as a standalone product 2 June 2026.)
- **Guardrails** — input/output policy enforcement, PII/moderation/prompt-injection, plus an integration mesh of external guardrail vendors.
- **Prompt management**, **Tracing/Observability**.

**Module B — AI Engineering / "AI Deploy"**
- Model serving (vLLM/SGLang/Triton/etc.), fine-tuning (QLoRA up to ~70B), notebooks (Jupyter/VS Code/SSH), jobs & cron, workflows (Flyte), async/batch inference, model registry, scale-to-zero (open-source **KubeElasti**), GPU management (MIG/time-slicing/spot).

### 2.3 Architecture & deployment
- **Split control-plane / compute-plane.** Control plane (UI, microservices, **Postgres**, blob storage, NATS queue, OTel collector) is TrueFoundry-hosted *or* self-hosted (enterprise). **Compute plane always runs in the customer's own Kubernetes** (EKS/GKE/AKS/OpenShift/OKE/on-prem). [DOCS]
- **Outbound-only agent** (`tfy-agent`, secure WebSocket/gRPC) → no inbound ports opened; **data (weights, customer data, GPU) never leaves the customer VPC** in self-hosted mode. [DOCS]
- Installed via **Helm** (+ optional ArgoCD). Built on Istio, Argo (CD/Workflows/Rollouts), Prometheus/Grafana, KEDA/Karpenter, Victoria Logs/Vector. **SaaS / hybrid / fully self-hosted / air-gapped** all supported. [DOCS]
- Tech stack: **Python** SDK/CLID (`truefoundry`), **Go** (KubeElasti), TypeScript/Node frontend; open-source **Cognita** (RAG) and **KubeElasti** (scale-to-zero). [DOCS]

### 2.4 Security & compliance
- **SOC 2 Type 2 + HIPAA** (announced Aug 2024), **GDPR**. **No ISO 27001** found — do not assume it. Trust center is Vanta-powered (gated). [DOCS]
- RBAC: tenant-level roles + resource-level Viewer/Editor/Admin; YAML-declarable; AI-Gateway RBAC can scope by model family, action, environment. **SSO: SAML 2.0 + OIDC** (Google, Entra ID, Okta, Keycloak), **SCIM** provisioning, JWT/API-key auth, token rotation. Encryption AES-256 at rest / TLS 1.2+ in transit; integrates AWS/Azure/GCP secret managers. [DOCS]
- Caveat (their own docs): certifications cover **managed infra**; for self-hosted, "compliance depends on customer controls." [DOCS]

---

## 3. Full Feature Inventory

Legend for **Verified** column: **Live** = confirmed working/visible in devart instance · **Live (empty)** = module present but unconfigured here · **Docs** = documented only · **Gated** = present but blocked behind missing setup.

### 3.1 AI Gateway — LLM Gateway

| Feature | Where | What it does | For whom / problem | Strengths | Limitations | Verified |
|---|---|---|---|---|---|---|
| **Playground** | Model Gateway → Playground | Interactive chat against any connected model; save as prompt, get code snippet, view errors | Developers testing models/prompts | Fast iteration, code-export, multi-model | Single-pane test tool, not a full eval harness | **Live** |
| **Models catalog** | Model Gateway → Models | Register provider accounts + models; set **per-model input/output token pricing**; "Custom Endpoints" tab | Platform owners onboarding providers | Editable cost basis powers budgets/chargeback; OpenAI connected live (`gpt-4o-mini` @ $0.15/$0.60 per 1M) | Each provider/model added manually; instance had only 1 provider | **Live** |
| **Virtual Models** | Model Gateway → Virtual Models | Reusable logical model that routes across providers (weight / latency / priority) with fallbacks & param overrides | Reliability/cost engineers | Canary, failover, sticky routing for KV-cache reuse | Config is YAML-ish; none configured in instance | **Live (empty)** |
| **Routing / load balancing** | Virtual Models / Policies | weight-based, latency-based, priority-based; first-matching-rule-wins; match by subject/model/metadata | SRE/platform | Flexible, header-driven (`X-TFY-METADATA`) | YAML rule model has a learning curve | **Docs** |
| **Fallbacks & retries** | Routing config | Same-target retries (configurable codes/delay) then fallback to alternate targets; Anthropic stream-aware | Reliability | Sensible defaults (429/5xx), stream handling | — | **Docs** |
| **Rate limiting** | Policies | RPM/TPM limits, minute/hour/day windows, scope per user/model/virtual-account/metadata (≤2 dims); sliding-window token bucket | Cost/abuse control | Multi-dimensional buckets | Two-dimension cap | **Docs** |
| **Budgets / spend limits** | Policies | $ thresholds per day/week/month, per user/model/VA/metadata; **Enforcement vs Audit mode**; alerts at 75/90/95/100% via email/Slack | FinOps / governance | Audit mode, quarterly budgets (2026), alerting | Requires accurate model pricing entered | **Docs** |
| **Caching** | `x-tfy-cache-config` header | Provider prefix caching, exact-match, **semantic** (vector similarity); Redis-backed; per-user isolation + namespaces; TTL/version invalidation | Cost reduction | Three layers; tenant isolation | Semantic cache needs embedding config | **Docs** |
| **Cost tracking / observability** | AI Monitoring → Metrics | p50/p95/p99 latency, TTFT/ITL, tokens & $ per request/model/user/team; OTel/Prometheus export; CSV export | Platform + finance | 7 metric tabs (Model/MCP/Guardrail/Routing/Cache/Agent); **real data observed** | Dashboard historically lacked deep history (review note) | **Live** |
| **Request traces** | AI Monitoring → Request Traces | Per-request spans/traces, framework-agnostic | Debugging | Configurable trace routing/storage | — | **Live (nav)** |
| **Data Access / Data Routing rules** | AI Monitoring | Control who can view metrics; route trace/log data to chosen stores | Governance / residency | Granular data governance | Newer (2026) | **Live (nav)** |
| **Supported providers** | Models | OpenAI, Anthropic, Google Gemini/Vertex, AWS Bedrock/SageMaker, Azure OpenAI/Foundry, Cohere, Mistral, xAI, Groq, Together, DeepInfra, Perplexity, Databricks, SambaNova, Cerebras, ElevenLabs/Deepgram/Cartesia (audio), self-hosted OpenAI-compatible | Multi-provider shops | Very broad; chat/embeddings/image/audio/rerank/realtime | Model-count claims inconsistent (1,000+ vs 1,600+ vs 250+) | **Docs** (1 live) |
| **OpenAI-compatible API** | Gateway endpoint | One schema for every provider | Drop-in migration | Low switching cost into TF | — | **Docs** |

### 3.2 AI Gateway — MCP Gateway *(your most direct competitive surface)*

| Feature | What it does | Strengths | Limitations | Verified |
|---|---|---|---|---|
| **MCP Registry** | Central catalog of MCP servers; "Add Server"; per-server auth labels; **"Add to Client"** to wire Cursor/Claude Code/VS Code | Curated, discoverable, IDE-native | — | **Live** (1 server "doc", Remote, No Auth) |
| **Virtual MCP servers** | Curate/compose tools from multiple servers with **tool-level RBAC** | Least-privilege tool exposure | None configured in instance | **Live (empty tab)** |
| **Server types** | Remote MCP, **OpenAPI→MCP** conversion, **hosted stdio** servers (managed command + creds) | Turns any REST API into MCP | — | **Docs** + Live (remote) |
| **Inbound auth** | **OAuth 2.0 inbound** (use IdP tokens in IDEs without hardcoding); per-org token caching (Auth0) | Enterprise SSO into MCP | — | **Docs** |
| **Outbound auth** | OAuth **2LO/3LO**, centralized vault-backed credentials, **per-user header/credential overrides** | Solves multi-tenant upstream auth | — | **Docs** |
| **MCP guardrails** | Pre-tool / post-tool policy checks; Cedar policy for tools; moderate tool-call inputs/outputs | Governs *actions*, not just text | Newer (2026) | **Docs** |
| **MCP observability** | Request rates, latency, failures, full tool-usage audit trail | Visibility into agent tool calls | — | **Live** (MCP metrics tab populated) |
| **Prebuilt servers** | Slack, Confluence, Datadog, Sentry, GitHub (per marketing) | Faster onboarding | [MKTG] not verified live | **Mktg** |

### 3.3 AI Gateway — Agents, Guardrails, Prompts, Skills

| Feature | Where | What it does | Strengths | Limitations | Verified |
|---|---|---|---|---|---|
| **Agent Registry** | Agents → Registry | Register/govern agents: **TrueFoundry-Managed** + **Remote** tabs; "Create New Agent" | Framework-agnostic (LangGraph/CrewAI/AutoGen) | Empty in instance; Agent Gateway is recent | **Live (empty)** |
| **Agent Playground** | Agents → Playground | Test agents, runtime config, file/image attachments | Interactive | — | **Live (nav)** |
| **Skills registry** | Skills | Centralized, versioned, governed agent "skills" | Reuse/governance of tools | New (May 2026) | **Live (nav)** |
| **Guardrails registry & policies** | Guardrails → Registry / Policies | Group guardrails; input (PII mask, prompt-injection, moderation) + output (hallucination, secrets, SQL sanitize) pipelines; integrate Azure, OpenAI Moderation, Bedrock, Google Model Armor, CrowdStrike, Palo Alto Prisma AIRS, Patronus, Pillar; custom HTTP guardrails | Broad vendor mesh + native managed guardrails (Secret Detection, SQL Sanitizer, PII, Prompt-Injection) | Output guardrails can't stream; empty in instance | **Live (empty)** |
| **Prompt Registry** | Prompts | Versioned prompts (Name/Version/Model/Repository/Created-By); "Create Prompt" | Repeatable, versioned, tied to repos | Empty in instance | **Live (empty)** |

### 3.4 AI Engineering / "AI Deploy" *(present but gated in your instance)*

| Feature | What it does | Verified |
|---|---|---|
| **Services** | Deploy REST/gRPC/Streamlit/Gradio/FastAPI apps on K8s; canary/blue-green (Argo Rollouts) | **Gated** (`/deployments` visible, "No Services Found") |
| **Jobs / Cron** | Training/batch tasks, manual or cron; Forbid/Allow/Replace concurrency | **Gated** (tab present) |
| **Notebook / SSH** | Hosted Jupyter + VS Code on K8s, SSH in, idle auto-stop, persistent home | **Gated** (tab present) |
| **Workflows** | Flyte-based DAG pipelines (cron/webhook/on-demand) | **Gated** (tab present) |
| **Application Sets / Helm / Volumes** | Deploy raw manifests, Helm charts, manage volumes | **Gated** (tabs present) |
| **Model Registry** | Versioned, immutable model/artifact store on customer blob storage; 12+ frameworks | **Docs** |
| **Fine-tuning** | QLoRA up to ~70B (Llama/Mistral/Qwen/Gemma/Phi…), JSONL chat/completion, notebook or job mode | **Docs** |
| **GPU management** | MIG (A100/H100), time-slicing, fractional GPUs, spot, scale-to-zero (KubeElasti) | **Docs** |
| **Async / batch inference** | Queue-backed (SQS/Kafka/NATS/AMQP); batch-prediction API via gateway | **Docs** |

> **Key live finding:** AI Deploy requires a connected **compute plane (Kubernetes) + cloud Integration**. Your instance has neither (Integrations is empty), so the entire deploy half is **present-but-unusable** here. This is the natural state of the free SaaS gateway tier.

### 3.5 Platform-wide

| Feature | What it does | Verified |
|---|---|---|
| **Access Management** | Users, Teams, **Personal Access Tokens** (users) + **Virtual Accounts** (apps), **Default + Custom Roles**, **Audit Logs**; multiple roles per user, roles assignable to teams | **Live** (2 users: tenant-admin + member) |
| **Integrations** | Integration Providers (cloud accounts: AWS/Azure/GCP) + **Git** (GitOps; GitHub Actions/Bitbucket) | **Live (empty)** |
| **Repositories / Ask AI** | ML repositories; "Ask AI" assistant (beta) | **Live (nav)** |
| **Settings / theme / plan badge** | Global AI Gateway settings; light/dark; **"Developer Plan" badge confirms free tier** | **Live** |

---

## 4. SWOT Analysis

### Strengths
- **Breadth under one control plane.** LLM + MCP + Agent gateways + guardrails + prompts + observability + full model-serving/fine-tuning. Few competitors span both the gateway and the deploy plane. [DOCS][LIVE]
- **Genuine enterprise governance.** SOC 2 Type 2, HIPAA, GDPR; SAML/OIDC SSO + **SCIM**; tenant + resource RBAC, custom roles, virtual accounts, audit logs (all visible live). Data-sovereign self-hosting (VPC/on-prem/air-gapped, outbound-only agent, no data egress). [DOCS][LIVE]
- **Deep, current MCP feature set.** Virtual MCP servers with tool-level RBAC, OpenAPI→MCP, hosted stdio, OAuth 2LO/3LO, per-user credential overrides, pre/post-tool guardrails, MCP-specific metrics. This is a serious, recent investment. [DOCS][LIVE]
- **Pricing transparency (rare in category).** Public $0 / $499 / $2,999 tiers lower the evaluation barrier vs "contact sales"-only rivals. [DOCS]
- **Performance & cost narrative.** Self-published ~3–10ms added latency, 250–350 RPS/vCPU, semantic caching, K8s spot/scale-to-zero; case studies claim 40–60% cloud-cost cuts. [MKTG][VENDOR-FRAMED]
- **Real product velocity.** Near-weekly changelog; major 2026 launches (MCP guardrails, Agent Gateway, Skills registry, TrueFailover) + Seldon acquisition. [DOCS]
- **High (if shallow) review scores.** G2 ~4.6/5, Gartner Peer Insights 4.5/5; praised for ease-of-deployment and responsive support. [3P]

### Weaknesses
- **Operational weight / Kubernetes dependency.** The single most-repeated criticism: steep learning curve, requires K8s/cloud expertise, "heavier than needed for small teams." The compute plane is *always* K8s. [3P][VENDOR-FRAMED]
- **Closed source, no OSS data plane.** Teams that require an OSI-licensed data path (LiteLLM's core appeal) are explicitly told to look elsewhere. [3P]
- **Enterprise pricing opacity.** Real motion is "contact sales"; AWS Marketplace shows **~$100k/yr** entry (10 devs, +$1/user). Self-hosting adds **$600–$1,000/mo infra** on top of license. [3P]
- **Thin independent validation.** ~50 G2 reviews; **no findable organic Reddit/HN discussion** (HN presence is founder-submitted); Capterra/TrustRadius/PeerSpot effectively empty. Marketing volume outruns third-party proof. [3P]
- **Documentation gaps & early-stage polish.** Reviewers cite docs gaps for first-time/advanced setup, "some features feel early-stage," historically limited dashboard history; older reviews flagged weak RBAC / no approval-based rollout workflows. [3P]
- **Inconsistent self-reported numbers.** Model count (1,000+ vs 1,600+ vs 250+) and latency (sub-3ms vs ~5ms vs ~10ms p95) conflict across their own pages — erodes trust in benchmarks. [DOCS][MKTG]
- **Integration/positioning churn.** Three repositionings + a just-closed Seldon acquisition to integrate = execution risk and a diffuse message.
- **Not a general API gateway.** Centered on LLM/MCP/agent layers; not a Kong/Tyk replacement for non-AI traffic. [3P]

### Opportunities (gaps you could exploit)
- **Lightweight, non-Kubernetes deployment.** A product that runs without a K8s compute plane (e.g., serverless/Postgres-backed, like your stack) removes their biggest adoption tax for mid-market and non-platform teams.
- **Depth of fine-grained MCP/tool/data governance.** TrueFoundry's tool-RBAC and SQL-sanitizer are generic; a product with **per-tool, per-table, per-row, allowlist-validated** governance (as your repo implements) can win on governance *depth* for data-connector MCP servers.
- **Open-source / self-hostable trust.** An open or source-available data plane directly attacks their "no OSS tier" weakness.
- **Transparent, low-friction pricing for the MCP slice.** Their MCP Gateway is bundled into the **$2,999/mo Pro Plus** tier (≤50 servers, 5M tool calls) — a focused, cheaper MCP-governance offer undercuts that.
- **Onboarding & docs.** A "5-minute to first governed MCP server, no K8s" onboarding beats their setup curve.
- **Faster, narrower iteration.** A focused team can ship MCP-governance depth faster than a platform balancing three gateways + a deploy plane + an acquisition.

### Threats
- **They already ship a credible MCP Gateway** with OAuth, virtual servers, guardrails, observability — and iterate weekly. The window to differentiate on *table-stakes* is closing; you must compete on depth/UX/deployment, not parity.
- **Enterprise distribution & trust.** Intel Capital backing, Gartner recognition, cloud-marketplace co-sell (AWS ISV Accelerate, GCP/Azure marketplaces counting toward EDP commits), SOC2/HIPAA — hard for a newcomer to match on procurement.
- **Bundling pressure.** "One control plane" lets them give MCP governance away inside a broader deal; a point solution must justify a second vendor.
- **Roadmap overlap.** Their hiring + changelog show agent orchestration, evals, and governance as priorities — they may close your differentiation gaps over time.
- **Switching costs / lock-in (inverse).** Once a customer routes all traffic + identity + budgets through their gateway, displacing it is hard — first-mover advantage favors whoever lands the account first.

---

## 5. Feature Comparison — TrueFoundry vs. Your Product

> **"Your product"** is taken from the AI Connectivity repo: a focused **MCP governance / connectivity admin platform** — generic + workspace-scoped MCP proxy endpoints, OAuth 2.1 (oidc-provider) auth, **permission filtering at `tools/list` and `tools/call`**, **SQL allowlist validation + table restrictions** for data connectors, encrypted upstream credentials (libsodium), audit logging, RBAC (Owner/Admin/permission keys), rate limiting — built on Next.js 16 + Prisma/Postgres + Auth.js. It is **not** an LLM gateway or a model-deployment platform. Comparison is therefore scoped to the **MCP-governance overlap** plus adjacent gateway features for context.

| Capability | TrueFoundry | Your Product | Notes / who wins |
|---|---|---|---|
| **MCP server registry** | ✅ Central registry, remote/stdio/OpenAPI→MCP | ✅ Connector registry (proxy) | Parity on concept; TF broader on server types |
| **MCP inbound auth (OAuth)** | ✅ OAuth 2.0 inbound, IdP tokens in IDEs | ✅ **OAuth 2.1 + PKCE** (oidc-provider) | **Parity** — both real |
| **MCP outbound/upstream auth** | ✅ OAuth 2LO/3LO, per-user cred overrides, vault | ✅ Encrypted per-connector creds (libsodium) | TF richer on per-user OAuth; you encrypt at rest |
| **Tool-level permission filtering** | ✅ Virtual MCP + tool-level RBAC; pre/post-tool guardrails | ✅ **Filtering at tools/list & tools/call** | **Your depth opportunity** — make per-tool/per-arg governance best-in-class |
| **Data-connector governance (SQL/tables)** | ⚠️ Generic SQL-sanitizer guardrail | ✅ **SQL allowlist + table/row restrictions** | **You win on depth** for DB/data MCP servers |
| **Workspace / multi-tenant scoping** | ✅ Tenant + workspace (=K8s namespace) | ✅ Workspace-scoped MCP URLs | Parity |
| **RBAC** | ✅ Tenant + resource roles, custom roles, teams, virtual accounts | ✅ Owner/Admin/permission keys, per-workspace perms | TF more mature UI; you can match |
| **Audit logging** | ✅ Platform-wide, exportable (Splunk/Datadog), OTel | ✅ Audit log (non-blocking `after()`), retention cron | Parity on substance; TF on export integrations |
| **Observability / metrics** | ✅ Rich (7 dashboards, traces, p99, cost) | ⚠️ Audit-centric, no metrics dashboards yet | **TF wins** — a gap to close (table-stakes) |
| **SSO (SAML/OIDC) + SCIM** | ✅ SAML, OIDC, SCIM, Okta/Entra | ⚠️ Credentials + JWT (Auth.js) | **TF wins** — enterprise table-stakes gap |
| **Guardrails (PII/moderation/injection)** | ✅ Native + 8+ vendor integrations | ❌ Not in scope | TF wins; decide if in-scope for you |
| **LLM gateway (routing/caching/budgets)** | ✅ Full | ❌ Out of scope | Different product — don't chase |
| **Model deployment / fine-tuning / notebooks** | ✅ Full (AI Deploy) | ❌ Out of scope | Don't chase |
| **Rate limiting** | ✅ Multi-dim RPM/TPM | ✅ In-memory sliding window | Parity for single-instance; TF scales further |
| **Deployment model** | ⚠️ Kubernetes-native (heavy); SaaS/self-host/air-gap | ✅ **Lightweight (Next.js + Postgres), no K8s** | **You win on simplicity** |
| **Open source** | ❌ Closed (data plane) | ◻️ Opportunity (could be source-available) | **Differentiation lever** |
| **Pricing transparency** | ✅ Public tiers; enterprise gated (~$100k/yr) | ◻️ TBD | Opportunity to undercut MCP slice |
| **Compliance certs** | ✅ SOC2 T2 / HIPAA / GDPR | ⚠️ Not yet | Procurement gap for enterprise |
| **Independent validation** | ⚠️ ~50 G2 reviews, thin organic | ◻️ Greenfield | Both early; TF ahead |

Legend: ✅ strong/present · ⚠️ partial/weak · ❌ absent · ◻️ opportunity/TBD

---

## 6. Prioritized Recommendations

### (a) Table-stakes you MUST match (to be credible in MCP governance)
1. **Enterprise SSO (SAML + OIDC) and ideally SCIM.** This is the clearest gap (you're on Credentials/JWT). No enterprise buys an identity-governance product that can't federate identity. **Highest priority.**
2. **Observability dashboards.** TF's metrics/traces are a verified strength and your audit-only posture lags. Ship at minimum: per-tool call counts, latency, error rates (esp. tool-call failures — recall the live instance showed a 21-event HTTP-405 MCP error breakdown), and per-user/workspace usage. **High priority.**
3. **Virtual/curated MCP servers** — compose a least-privilege subset of tools from one or more upstreams and expose it as one endpoint. Pairs naturally with your existing tool filtering.
4. **IDE wiring UX** — a one-click "Add to Client" for Cursor/Claude Code/VS Code (TF has this) lowers adoption friction dramatically.
5. **Pre/post-tool policy hooks** — generalize your SQL allowlist into a pluggable pre-tool / post-tool guardrail contract so governance isn't only SQL.

### (b) Where you can differentiate (lean in hard)
1. **Depth of fine-grained, data-aware governance.** TF's tool-RBAC and SQL sanitizer are generic; your **per-tool, per-table, per-row, allowlist-validated** model is a genuine wedge for *data-connector* MCP servers (databases, internal APIs). Make this the sharpest, best-documented capability in the category.
2. **Zero-Kubernetes, lightweight deployment.** Your Next.js + Postgres stack runs anywhere in minutes — directly attacking TF's #1 weakness (operational weight). Market "governed MCP in 5 minutes, no cluster."
3. **Open-source / source-available data plane.** Neutralizes TF's "no OSS tier" weakness and builds trust for the data path — a real buying criterion for a governance product.
4. **Transparent, focused pricing.** TF buries MCP Gateway in a $2,999/mo tier (≤50 servers/5M calls) or enterprise contact-sales. A transparent, generous MCP-governance price undercuts that and converts evaluators.
5. **Onboarding & docs quality.** Reviewers ding TF docs for first-time setup. A flawless quickstart is cheap to build and a durable advantage.

### (c) What they do that you should deliberately NOT copy
1. **Don't build an LLM gateway** (routing/caching/budgets across 1,000+ models). Crowded (LiteLLM/Portkey/Kong) and orthogonal to MCP governance. Integrate with one instead.
2. **Don't build the AI Deploy plane** (model serving, fine-tuning, notebooks, K8s orchestration). Enormous surface, deep K8s expertise, and the exact complexity that burdens TF.
3. **Don't go Kubernetes-native** for your own deployment. Your lightweight stack is an asset; preserve it.
4. **Don't chase breadth-for-breadth's-sake** (agent orchestration, Skills registry, model registry). Resist the "control plane for everything" gravity that diffuses TF's message; win on focused depth.
5. **Don't over-claim benchmarks.** TF's inconsistent latency/model-count numbers cost them credibility; publish only numbers you can reproduce.

---

## 7. Sources & Access Log

### 7.1 Live access log — `https://devart.truefoundry.cloud/` (authenticated as victorg@devart.com, 2026-06-30)
Instance: **v0.154.2, "Developer Plan" (free tier)**. Browser screenshots captured for each. Note: screenshots intermittently timed out during heavy SPA loads; navigation map captured via accessibility tree.

| Route | Result | Verified state |
|---|---|---|
| `/llm-gateway/playground` | ✅ Loaded | Working chat, model selector, save-prompt, code-snippet |
| `/llm-gateway/models` | ✅ Loaded | **OpenAI connected**, `gpt-4o-mini` (Chat, $0.15/$0.60 per 1M); Custom Endpoints tab; provider tray |
| `/llm-gateway/virtual-models` | ✅ Loaded | Empty ("No Virtual Models Configured") |
| `/llm-gateway/mcp-servers` | ✅ Loaded | **1 server: "doc" (Remote, No Auth)**; Registry + Virtual MCPs tabs; Add to Client |
| `/guardrails/registry` + `/policies` | ✅ Loaded | Empty ("No Guardrails Groups") |
| `/agents/registry` + `/playground` | ✅ Loaded | Managed + Remote tabs, empty ("No rows") |
| `/monitoring/metrics` | ✅ Loaded | **Real telemetry**: 11 requests (all MCP), 21 HTTP-405 MCP errors (28.4%), 0 model/guardrail errors; 7 metric tabs |
| `/monitoring/{request-traces,data-access,data-routing}` | ✅ Nav present | — |
| `/prompts` | ✅ Loaded | Empty Prompt Registry; Create Prompt |
| `/skills`, `/ask-ai`, `/repositories` | ✅ Nav present | Not deep-inspected |
| `/integrations` | ✅ Loaded | Empty; Integration Providers + Git tabs |
| `/access-management` | ✅ Loaded | **2 users** (tenant-admin + member); Users/Teams, PATs, Virtual Accounts, Default/Custom Roles, Audit Logs |
| `/deployments` | ✅ Loaded | **Gated/empty** (no compute plane): Services/Jobs/Notebook-SSH/Workflows/App Sets/Helm/Volumes tabs all present, "No Services Found" |

**Not reachable / not tested:** gated AI-Deploy actions (no cluster connected); enterprise-only features; anything requiring a paid tier. No intrusive probing performed — authenticated read-only navigation only.

### 7.2 Public sources (selected; full set gathered during research)
**Product & docs [DOCS]:** truefoundry.com/docs/platform/overview · /docs/ai-gateway/intro-to-llm-gateway · /docs/ai-gateway/mcp/mcp-overview · /docs/ai-gateway/{ratelimiting,budgetlimiting,guardrails-overview,supported-providers} · /docs/platform/{security-and-compliance,control-plane-architecture,compute-plane-architecture} · /docs/model-deployment/overview · /docs/changelog · truefoundry.mintlify.app/docs/ai-gateway/load-balancing-overview
**Marketing [MKTG]:** truefoundry.com (homepage) · /ai-gateway · /mcp-gateway · /product-tour · /pricing · /security · /case-studies · /partners/{aws,gcp}
**Company/funding/press [3P]:** TechCrunch (2022-09-19 seed; 2025-02-06 Series A) · Entrackr (2025-02-06) · SiliconANGLE & Businesswire (2026-06-24/25 Seldon acquisition) · Businesswire (2026-06-02 Agent Gateway) · en.wikipedia.org/wiki/TrueFoundry
**Reviews/sentiment [3P]:** g2.com/products/truefoundry (~4.6/5, ~50 reviews) · gartner.com/reviews/product/truefoundry-ai-platform (4.5/5) · aws.amazon.com/marketplace (4.6/5, 55 mirrored; **~$100k/yr enterprise listing**) · glassdoor (employee 4.7/5) · capterra/trustradius/peerspot (no usable reviews)
**Competitive comparisons:** TrueFoundry-authored /vs/{litellm,portkey,kong,databricks} **[VENDOR-FRAMED]**; neutral techsy.io, contabo.com, lunar.dev; competitor-authored futureagi.com
**Tech stack [DOCS]:** github.com/truefoundry/{truefoundry-python-sdk,KubeElasti,cognita} · pypi.org/project/truefoundry · truefoundry.github.io/infra-charts
**Hiring [3P]:** truefoundry.com/careers → app.careerpuck.com/job-board/truefoundry; Wellfound/LinkedIn/Naukri mirrors

### 7.3 Key caveats / things to treat as unverified
- **Performance numbers** (latency 3–10ms, 250–350 RPS/vCPU, 99.99% uptime, 10B+ req/mo, 30–60% cost savings) are **self-published [MKTG]/[VENDOR-FRAMED]** — not independently benchmarked.
- **Model count** is inconsistent across TF's own pages (1,000+ / 1,600+ / 250+).
- **Reddit/HN sentiment** could not be sourced organically — do not cite practitioner forums as evidence; sentiment rests on ~50 G2 + small Gartner samples.
- **Enterprise pricing** is gated; the ~$100k/yr figure is a single AWS Marketplace data point, not a quoted list price.
- **Free-tier limits** ($0 Developer = 50k req/mo, 3 users) come from the pricing page via search synthesis; the **"Developer Plan" badge is confirmed live**, exact limits are [DOCS] not re-verified line-by-line.
- **ISO 27001** is **not** claimed anywhere — don't assume it; confirmed certs are SOC 2 Type 2, HIPAA, GDPR.
