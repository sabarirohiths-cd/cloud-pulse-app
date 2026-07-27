# Cloud Pulse Control Module - Chat Memory Context

> *Paste this entire document into your new chat to give the AI complete context of our progress.*

## 1. Project Overview & Decisions
- **Project Name:** `cloud-pulse-control-module`
- **Purpose:** A brand-new, standalone workspace module extending the CloudPulse platform. It performs **live lifecycle control and automated scheduling (Power ON/OFF)** for cloud infrastructure.
- **Architectural Decision:** We intentionally created this as a separate workspace rather than modifying the existing `cloud-pulse-inventory-module`. We extracted and ported the essential configuration/security logic from the inventory module over to this new root.

## 2. Backend Architecture (Python / FastAPI)
- **Database Engine:** Asynchronous SQLAlchemy using SQLite in WAL mode for high concurrency.
- **Data Models:** 
  - `CloudConfig`: Secure storage of encrypted cloud credentials.
  - `ResourceControlSchedule`: Tracks power schedules (timezone, start/stop times) and automation toggle states.
  - `CloudResource`: Discovered cloud assets tracking `service_type` (e.g., EC2, RDS, DOCUMENTDB) and `control_type` (DIRECT_POWER, SCALE_TO_ZERO).
- **Security:** AES/Fernet symmetric encryption for credential storage (`security.py`).
- **Dynamic Multi-Cloud Router (`control_service.py`):** 
  - Implemented a dynamic `importlib` router. It intercepts action requests and dynamically searches through categorized subdirectories (`direct_power`, `scale_to_zero`, `destroy_recreate`) to discover and load the appropriate `Handler` plugin.
- **Provider-Specific Isolation:**
  - `aws/handlers/direct_power/ec2_handler.py`: Boto3 execution with strict pre-execution state checks (e.g., must be `stopped` to start).
  - `aws/handlers/direct_power/rds_handler.py`: Handles both RDS clusters and instances with state validation.
  - Scaffolded empty `azure/handlers/` and `gcp/handlers/` directories for future expansion.
- **Automation Scheduler (`scheduler.py`):** Background task loop running via FastAPI lifespan to evaluate scheduling rules.
- **JWT Email Notifier (`notifier.py`, `actions.py`):** Built a system to generate secure JWT tokens and send pre-shutdown warning emails. Includes webhook endpoints to process "Extend 2 Hours" override clicks directly from the email.

## 3. Frontend Architecture (React / Tailwind)
- **Tech Stack:** Standard React 19 application built with `react-scripts` (explicitly chose non-Vite per requirements), styled with Vanilla CSS / Tailwind.
- **API Client:** Configured `axios` with global interceptors (`api.js`) to catch network errors and display clean toast notifications using `sonner`.
- **Views:**
  - `ConfigPage.js`: UI for managing AWS/Azure/GCP credentials, running live verification tests, and listing connected accounts.
  - `ControlPage.js`: The Live Control dashboard. Fetches resource schedules, displays summary KPIs (Running vs. Stopped), provides search filtering, and renders a data table for EC2/RDS.
  - `ActionModal.js`: A dynamic popup dialog for manual power toggles and configuring automated Start/Stop times and timezones.

## 4. Chronological Progress & Milestones

### July 22, 2026 (Phase 1 & Foundation)
- **Strategy Plugin Architecture:** Successfully migrated AWS handlers (EC2/RDS) to a dynamic Plugin Strategy Architecture (`CloudResourceHandler`). Refactored the AWS Scanner to utilize `ThreadPoolExecutor` to iterate through registered plugins for ultra-fast parallel cloud discovery.
- **Enhanced Resource UI & Instance Specs:** Upgraded the `ResourcesTab` to display rich instance specifications (e.g., `t3.micro`) natively mapped from the database. Added multi-cloud provider badges (AWS/Azure/GCP) to visually distinguish resources in the dashboard.
- **Activity Audit Logging System:** Replaced the empty "Changes" tab with a fully functional `ActivityLogTab`. Deployed a new `ActionAuditLog` database table and APIs to strictly track all manual power toggles and scheduled events with success/failure status and timelines.
- **Real-Time Polling Engine:** Upgraded the frontend `ControlPage.js` to utilize optimistic UI updates (`STARTING`/`STOPPING`). Implemented a smart background polling engine that checks transitioning resources every 10 seconds against a new high-speed `GET /state` backend endpoint. This seamlessly bridges the gap between DB cache and live Boto3 AWS transition states.
- **Windows Timezone Support:** Installed `tzdata` to polyfill the IANA database for the `zoneinfo` package, fully stabilizing the Background Automation Scheduler for Windows environments.
- **Environment Stabilization:** Resolved Python global environment conflicts by enforcing an isolated, clean virtual environment.
- **Data Model Decoupling:** Successfully decoupled SQLAlchemy models out of `database.py` and into dedicated files (`models/resource.py`, etc.) for cleaner architecture.
- **Aurora Cluster Bug Fix:** Resolved a critical bug in `control_service.py` where uppercase `"AURORA"` bypassed the `is_cluster=True` flag, causing `DBInstanceNotFound` errors in AWS.

### July 23, 2026 (Architecture Expansion)
- **Handler Restructuring (Direct Power):** Architecturally grouped AWS plugins into `direct_power`, `scale_to_zero`, and `destroy_recreate` directories. Overhauled the dynamic router in `control_service.py` to seamlessly recursively search and load plugins from these folders.
- **Expanded Plugin Fleet:** Successfully built, registered, and verified full Direct Power lifecycle control (Discovery, Start, Stop, State checks) for four new plugins: **DocumentDB**, **Redshift**, **SageMaker Notebooks**, and **Amazon WorkSpaces**.
- **Robust Exception Parsing:** Implemented a centralized `parse_aws_client_error` and a smart `log_once` caching mechanism in `base_handler.py`. This globally intercepts AWS API errors (`OptInRequired`, `AccessDenied`, `EndpointConnectionError`) across the parallel region scanner, translating raw tracebacks into clean, deduped, human-readable terminal warnings.

### July 27, 2026 (Advanced Scheduling & Schema Polish)
- **Advanced Automation Scheduling:** Completely redesigned the scheduling UI (ActionModal.js and ControlResourceDetailModal.js) to support complex cron-like patterns (daily, mon_fri) and capture owner_email for pre-shutdown notifications.
- **Schema Consistency:** Migrated local SQLite tables via ALTER TABLE to inject new scheduling columns safely. Standardized the backend by extracting ScheduleUpdatePayload and ManualPowerActionPayload out of the API router and cleanly relocating them into pp/schemas/control/control_resource.py to adhere to strict FastAPI architectural patterns.
- **UX Simplification:** Removed the clustered multi-pane layout in ActionModal.js in favor of a sleek, single-column focused dialog for executing manual power toggles and configuring automation settings.
