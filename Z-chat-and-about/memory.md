# CloudPulse Unified Memory Log
*(Last Updated: 2026-08-06)*

This document serves as the single source of truth and ongoing memory of the architecture, refactoring, and optimizations performed on the CloudPulse codebase.

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

## 4. Chronological Progress & Optimizations

### July 22, 2026 (Foundation & UI Modernization)
#### Codebase Unification
- **Monorepo Setup:** Merged the previously isolated frontend and backend modules into a single, unified cloud-pulse-app structure.
- **Model Consolidation:** Deduplicated the inventory SQL models and standardized import paths to resolve recursive ImportError issues across the unified backend.
- **Service Standardization:** Fixed explicit imports for AWSService (app.services.aws.service) due to an empty __init__.py structure.

#### Frontend Modernization & Routing
- **Unified Navigation:** Configured react-router in App.js to provide seamless navigation between the Config, Inventory, and Control modules under a single responsive shell.
- **Tailwind Integration:** Established a consistent, modern UI using Tailwind CSS, moving away from disparate CSS files.

#### UI Virtualization
- **DOM Freeze Prevention:** Replaced standard HTML tables in the Control module (ResourcesTab.js) with react-virtuoso (TableVirtuoso). This ensures the UI remains silky smooth even when interacting with datasets of 8,000+ cloud resources by only rendering rows currently visible on the screen.

### July 24, 2026 (Performance & Architecture Refactoring)
#### Backend Performance & Bottleneck Optimizations
When scaling up to test accounts with 8,000+ active resources, we encountered severe 2-5 second API loading delays. We resolved this through structural API rewrites:
- **Native SQL JSON Extraction:** The /filter-options APIs in both inventory.py and control.py were originally fetching all 8,000 JSON strings into memory and looping over them in Python using json.loads(). This was completely rewritten to use SQLite's native json_each function, pushing the heavy lifting to the C-based database engine and achieving near-instantaneous (O(1) memory) execution.
- **Server-Side Pagination:** Refactored the Control module to stop fetching the monolithic 8,000-record dataset. We implemented server-side limit and offset pagination matching the Inventory module's architecture.
- **Summary Aggregation APIs:** Created a standalone /summary endpoint in the Control module that uses raw SQL func.sum() and case() logic to calculate total running/stopped counts instantaneously without transferring actual records to the frontend.

#### Control Page Refactoring & Infinite Scroll
- **Architectural Shift:** Completely removed the global resources state array from ControlPage.js. The parent component now only manages global filters and lightweight summary data.
- **Infinite Scrolling:** Integrated the server-side pagination with the frontend's TableVirtuoso endReached callback in ResourcesTab.js, allowing the frontend to dynamically load 50 records at a time as the user scrolls.
- **Optimized Polling Engine:** Re-architected the Real-Time Polling engine to only poll the live AWS state for the resources that are actually loaded and visible on the frontend, rather than polling thousands of instances continuously.
- **Dynamic Filtering:** Fixed a bug in the Control Page where the Account dropdown was not dynamically syncing with the chosen Cloud Provider.

### July 27, 2026 (Advanced Scheduling & Schema Polish)
- **Scheduling Capabilities:** Added schedule_pattern (e.g. daily vs mon_fri) and owner_email functionality to support pre-shutdown email notifications.
- **UX Redesign:** Extracted the massive resource details pane from ActionModal.js into its own standalone ControlResourceDetailModal.js. Streamlined the ActionModal specifically for execution and configuration workflows.
- **Strict FastAPI Architectures:** Cleaned up technical debt by relocating Pydantic payload models (ScheduleUpdatePayload, ManualPowerActionPayload) directly out of the api/control.py route file and correctly into the schemas directory.
- **Safe SQL Injection:** Utilized ALTER TABLE to inject scheduling columns into the local SQLite DB to prevent wiping prior resource synchronization data.

### July 28, 2026 (Amazon ECS Scale-to-Zero Handler)
- **ECS Scaling:** Created ECSScaleToZeroHandler to safely power down ECS services to exactly 0 tasks.
- **Dynamic Capacity Discovery:** Engineered dynamic discovery in ecs_discovery.py to identify unmanaged Auto Scaling Groups attached to container instances and safely suspend EC2 capacity alongside ECS replica counts.
- **Defensive Fargate Logic:** Implemented defensive programming checks to verify launchType and capacityProviderStrategy, bypassing ASG downscaling for Fargate applications.
- **FastAPI Path Matching:** Refactored api/control.py state polling to use {resource_id:path} to support ARNs containing slashes.

### July 29, 2026 (Database Locks & Aggressive Scale-to-Zero)
- **Database Transaction Lock Bypass:** Updated api/control.py and api/inventory.py to explicitly release SQLite locks using await db.commit() prior to long-running AWS API network scans. This solved a severe issue where a 4-minute background AWS network scan froze all other API calls attempting to access the dashboard.
- **Deep Launch Template Inspection for ECS ASGs:** Supplemented standard ECS cluster discovery in asg_discovery.py by adding async_get_ecs_cluster_from_launch_template to scan Launch Template UserData (Base64 decoded) for the ECS_CLUSTER= tag. This ensures Unmanaged ASGs correctly map their parent ECS services even when their EC2 instances are fully terminated (scale-to-zero).
- **Aggressive Scale-to-Zero ASG Override:** Updated ecs_handler.py to aggressively bypass AWS Capacity Provider logic. When a user explicitly stops a Managed ECS Service, CloudPulse ignores MinSize=1 constraints and forces the underlying Managed ASG to exactly 0 to guarantee total cost savings, restoring the original MinSize configuration upon restart.
- **Automatic Synchronous UI Shadowing:** Updated the /toggle-power backend API in control.py. The backend now reads the returned handler payload or saved database config to identify linked secondary resources (like ASGs). It automatically sets these secondary resources to optimistic STARTING/STOPPING states in the local database instantaneously, removing the need for a manual AWS Sync just to update the ASG status UI.

### July 30, 2026 00:42 (UI/UX Polishing & Pagination Fixes)
- **Delayed Skeleton Loaders:** Fixed aggressive UI flickering on fast data fetches by wrapping TableSkeleton and header spinners in a delayed fade-in animation (150ms). This prevents loading indicators from flashing if the backend responds near-instantaneously.
- **Virtuoso Pagination Bug:** Fixed a critical bug across all Inventory and Control tabs where background pagination (endReached) triggered loading=true, which aggressively unmounted TableVirtuoso and replaced it with a skeleton loader, destroying user scroll position. Skeleton loaders are now strictly limited to initial empty-state loads.
- **Unified Frameless Filters:** Refactored the FilterBar implementation across ResourcesTab, ChangesTab, DeletedTab, and ActivityLogTab to use a consistent, frameless inline layout, stripping out redundant background panels and borders.
- **ChangesTab Restructuring:** Rewrote the ChangesTab layout to decouple the filters from the main table container, mirroring the clean separation found in the Control module's ActivityLogTab. Moved dynamic date range badges directly into the sticky table headers.

### July 30, 2026 (State Resilience & Discovery)
- **Dynamic Scale-Up Auto-Discovery:** Implemented `dynamic_discovery.py` to intercept successful `RUNNING` transitions for ASG and ECS workloads. It dynamically queries AWS for the brand new underlying EC2 instances (which have newly randomized IDs) and injects them into the SQLite database, automatically mapping their `parent_resource_id` to ensure total inheritance of the parent's schedule and guardrails.
- **Crash Resilience & State Reconciliation:** Hooked into FastAPI's native `lifespan` event (`main.py`) to scan the SQLite database on startup for any resources stuck in `STARTING` or `STOPPING` states (e.g., if the backend crashed mid-transition). It automatically calculates the target state and spawns background tasks (`state_monitor.py`) to resume real-time monitoring and complete the lifecycle transition seamlessly.
- **Audit Log Standardization & Race Condition Fix:** Uncovered and fixed a subtle race condition where the real-time `state_monitor.py` was completing transitions faster than the global sync, but forgetting to insert an audit log. Wired `state_monitor.py` directly into the `ControlActionLog` table and completely standardized all event terminology across the backend to strictly use `MANUAL START/STOP` and `SCHEDULE START/STOP` for perfect UI icon rendering.
- **Architectural Cleanup:** Following management directives for a unified global daily sync in the final integrated platform, we completely ripped out the redundant, memory-heavy `run_auto_sync` background discovery loop from `scheduler.py` and `main.py`. The backend now runs completely lean, dedicating its single background loop exclusively to the Control Module Automation Scheduler.

### July 31, 2026 (Global Notification System)
- **Centralized Notification Engine:** Built a unified notification engine to capture transient toast alerts and persist them to the database. Created the SystemNotification SQLAlchemy model to store event data across both Control and Inventory modules.
- **Background TTL Cleanup:** Injected a garbage collection routine into the run_control_scheduler background loop. It runs exactly once per hour to automatically purge any system notifications older than 48 hours, preventing long-term SQLite database bloat.
- **UI Integration:** Developed a reusable NotificationBell.js component with real-time API polling and integrated it seamlessly into the sticky headers of both ControlPage.js and InventoryPage.js next to the global Sync buttons.
- **Backend Hooks:** Wired the sync_resources API and the real-time state_monitor.py transitions to automatically push asynchronous success/error notifications directly into the Bell, ensuring users never miss background lifecycle events even when navigating across the platform.

### August 3, 2026 (Architectural Pivot: aioboto3 to boto3 ThreadPools)
- **Problem Statement:** During discovery benchmarking, aioboto3 showed severe latency penalties on small resource payloads (10-50 resources) due to heavy async client initialization and session overhead (taking ~300ms per task).
- **Optimization Strategy:** Migrated all AWS resource sync pipelines from aioboto3 to standard boto3 wrapped in ThreadPoolExecutor (asyncio.to_thread).
- **Benefits:** Eliminated cold-start latency by using urllib3 C-extensions. Maintained non-blocking FastAPI behavior by offloading network I/O to background threads, which release the GIL. Ensures scalability to 50k+ resources.
- **Resilience Enhancements:** Implemented botocore.config.Config on boto3 sessions with 10 max retries, exponential backoff with jitter, and max_pool_connections=50 to prevent connection pooling bottlenecks across concurrent multi-region threads.

### August 3, 2026 (EKS Scale-to-Zero & Inventory Analytics Polish)
- **EKS Scale-to-Zero Handlers:** Implemented `EKSHandler` to facilitate start/stop functionality for both Managed Node Groups and Unmanaged ASGs. Added critical logic to respect `ResourceInUseException` during node group updates and explicitly preserve `maxSize` across state transitions.
- **EKS Auto Mode Support:** Updated the EKS discovery scanner to evaluate `cluster.computeConfig.enabled`. Dynamically categorizes EKS clusters as `EKS_AUTO_MODE` (native dynamic scaling) versus `STANDARD` (supports manual/scheduled scale-to-zero) and prunes unnecessary API queries for Auto Mode clusters.
- **EKS Scaled-to-Zero Deep Discovery:** Eliminated a critical discovery blind spot for Unmanaged EKS ASGs that are scaled to 0 and lack native tags. Introduced a two-phase fallback leveraging `describe_auto_scaling_groups` and deep Launch Template UserData Base64 decoding to reliably parse the EKS bootstrap cluster name `/etc/eks/bootstrap.sh <cluster_name>` without requiring live instances.
- **Cascading EKS Monitoring Flow:** Developed an asynchronous state orchestration flow (`eks_flow.py`) that strictly enforces Parent-Child startup sequencing for EKS (Cluster -> Managed Node Groups -> Unmanaged ASGs), preventing race conditions during bulk cluster power-ons.
- **Inventory Global Filtering Alignment:** Overhauled the `/inventory/changes` backend API to perform a SQL `OUTER JOIN` against `InventoryResource`, guaranteeing that the Changes log explicitly respects the Global Top Filters (Region, Tag, Linked Account).
- **Deleted Resource Analytics:** Engineered a parallel aggregation pipeline (`deleted_type_breakdown` and `deleted_region_breakdown`) in `inventory_queries.py`. Injected these dedicated datasets specifically into the Deleted Tab to prevent dropdown contamination from active resource metrics and break a cyclical React `useEffect` rendering deadlock.

### August 6, 2026 (Settings UI Overhaul & Visibility Inheritance)
- **Settings Preferences Tree UI:** Redesigned the Settings tab (`SettingsTab.js`) to move away from rigid data tables into a sleek, iOS-style preferences menu (`SettingsRow.js`) with native toggle switches. Stripped out redundant filters to strictly enforce a Grouped structural hierarchy.
- **Family Inheritance Filtering:** Rewrote the filtering engine in `ResourcesTab.js` to intelligently preserve structural tree integrity. When a parent cluster (e.g., EKS) passes a filter query, the UI automatically inherits and displays all of its nested child EC2 instances, fixing critical visual bugs during bulk filtering.
- **Dynamic Visibility Sync Integration:** Updated the `dynamic_discovery.py` backend auto-discovery logic. When AWS spins up brand new EC2 child instances and the backend intercepts them, the system now automatically queries and inherits the exact visibility state (`is_visible`) of the parent EKS cluster, guaranteeing that hidden clusters do not randomly leak visible child nodes into the Control UI.

### August 7, 2026 (Dynamic Filtering & Pagination Polish)
- **Inventory Empty States:** Fixed a filtering bug where selecting "All Services" alongside "All Types" sent invalid type constraints to the backend, causing 0 results to be returned. Rewrote `getTypeParam` locally within `ResourcesTab` and `DeletedTab` to resolve correctly to `null`.
- **Custom Grouping Injections:** Refactored the core `useDynamicFilters` custom hook. Instead of hardcoding generic AWS resource group mapping rules that inaccurately split `RDS` and `AURORA` clusters, the hook now accepts a `getGroupFn` override injection. This allows the Control module to merge them accurately based on its specific dashboard layout requirements.
- **Dynamic Active Summaries:** Stripped strict type-mapping logic out of `useDynamicFilters` and replaced it with an `activeTypeParam` argument. This ensures that the backend aggregate summary requests use exact ARN string mappings (like `aws:ec2:instance`) for Inventory, while using generic string types (`EC2`) for Control.
- **Filter Count Culling:** Implemented defensive array culling inside `useDynamicFilters` to aggressively drop any Group, Type, or Region option from dropdowns if its backend count hits `0` (unless it is the currently selected option), preventing UI clutter on heavy drill-down filters.
- **Dependency Optimizations:** Addressed React `exhaustive-deps` ESLint warnings by extracting array `.length` checks directly into root variables above `useEffect`, preventing potential infinite re-render cycles in the complex filter matrices.
