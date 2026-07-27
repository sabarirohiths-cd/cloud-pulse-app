# CloudPulse Unified Memory Log
*(Last Updated: 2026-07-24)*

This document serves as an ongoing memory of the architecture, refactoring, and optimizations performed on the CloudPulse codebase.

## 1. Codebase Unification
- **Monorepo Setup:** Merged the previously isolated frontend and backend modules into a single, unified `cloud-pulse-app` structure.
- **Model Consolidation:** Deduplicated the inventory SQL models and standardized import paths to resolve recursive `ImportError` issues across the unified backend.
- **Service Standardization:** Fixed explicit imports for `AWSService` (`app.services.aws.service`) due to an empty `__init__.py` structure.

## 2. Frontend Modernization & Routing
- **Unified Navigation:** Configured `react-router` in `App.js` to provide seamless navigation between the Config, Inventory, and Control modules under a single responsive shell.
- **Tailwind Integration:** Established a consistent, modern UI using Tailwind CSS, moving away from disparate CSS files.

## 3. UI Virtualization
- **DOM Freeze Prevention:** Replaced standard HTML tables in the Control module (`ResourcesTab.js`) with `react-virtuoso` (`TableVirtuoso`). This ensures the UI remains silky smooth even when interacting with datasets of 8,000+ cloud resources by only rendering rows currently visible on the screen.

## 4. Backend Performance & Bottleneck Optimizations
When scaling up to test accounts with 8,000+ active resources, we encountered severe 2-5 second API loading delays. We resolved this through structural API rewrites:
- **Native SQL JSON Extraction:** The `/filter-options` APIs in both `inventory.py` and `control.py` were originally fetching all 8,000 JSON strings into memory and looping over them in Python using `json.loads()`. This was completely rewritten to use SQLite's native `json_each` function, pushing the heavy lifting to the C-based database engine and achieving near-instantaneous (O(1) memory) execution.
- **Server-Side Pagination:** Refactored the Control module to stop fetching the monolithic 8,000-record dataset. We implemented server-side `limit` and `offset` pagination matching the Inventory module's architecture.
- **Summary Aggregation APIs:** Created a standalone `/summary` endpoint in the Control module that uses raw SQL `func.sum()` and `case()` logic to calculate total running/stopped counts instantaneously without transferring actual records to the frontend.

## 5. Control Page Refactoring & Infinite Scroll
- **Architectural Shift:** Completely removed the global `resources` state array from `ControlPage.js`. The parent component now only manages global filters and lightweight summary data.
- **Infinite Scrolling:** Integrated the server-side pagination with the frontend's `TableVirtuoso` `endReached` callback in `ResourcesTab.js`, allowing the frontend to dynamically load 50 records at a time as the user scrolls.
- **Optimized Polling Engine:** Re-architected the Real-Time Polling engine to only poll the live AWS state for the resources that are actually loaded and visible on the frontend, rather than polling thousands of instances continuously.
- **Dynamic Filtering:** Fixed a bug in the Control Page where the Account dropdown was not dynamically syncing with the chosen Cloud Provider.

## 6. Advanced Scheduling & Schema Polish (2026-07-27)
- **Scheduling Capabilities:** Added schedule_pattern (e.g. daily vs mon_fri) and owner_email functionality to support pre-shutdown email notifications.
- **UX Redesign:** Extracted the massive resource details pane from ActionModal.js into its own standalone ControlResourceDetailModal.js. Streamlined the ActionModal specifically for execution and configuration workflows.
- **Strict FastAPI Architectures:** Cleaned up technical debt by relocating Pydantic payload models (ScheduleUpdatePayload, ManualPowerActionPayload) directly out of the pi/control.py route file and correctly into the schemas directory.
- **Safe SQL Injection:** Utilized ALTER TABLE to inject scheduling columns into the local SQLite DB to prevent wiping prior resource synchronization data.
