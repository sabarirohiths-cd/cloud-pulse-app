# Cloud Pulse Control Module - Architectural Documentation

This document provides a comprehensive overview of the entire codebase structure for the **Cloud Pulse Control Module**, detailing the responsibilities of both the frontend and backend architectures.

---

## 1. Backend Architecture (FastAPI / Python)
The backend is designed using an asynchronous, plugin-based architecture with FastAPI, SQLAlchemy, and SQLite.

### **Entry Point & Configuration**
*   `backend/main.py`: The FastAPI application entry point. Initializes routes, databases, and starts the background `scheduler.py` via FastAPI's lifespan events.
*   `backend/requirements.txt`: Python package dependencies.
*   `backend/migration_unified.py`: Standalone script for executing database schema migrations.

### **Core Systems (`backend/app/core/`)**
*   `config.py`: Environment variable loading and application settings.
*   `constants.py`: Centralized magic strings and standard variables (e.g., `PARENT_CONTAINER_SERVICES`).
*   `database.py`: SQLAlchemy asynchronous engine setup (SQLite in WAL mode) and legacy `ResourceControlSchedule` model definition.
*   `scheduler.py`: The background automated engine that evaluates active schedules and executes Start/Stop commands based on timezone conversions.
*   `security.py`: Fernet symmetric encryption utilities for securely storing and decrypting cloud credentials.

### **API Routing (`backend/app/api/`)**
*   `cloud_config.py`: Endpoints for adding, verifying, and managing cloud provider credentials.
*   `control.py`: Endpoints for the Live Control dashboard, including `GET /schedules`, `POST /toggle-power`, `POST /sync`, and the real-time `GET /state` endpoint.
*   `inventory.py`: Endpoints for fetching multi-cloud inventory resources, changes, and summary statistics.
*   `notifications.py`: Endpoints for fetching system alerts and background sync status.
*   `actions.py`: Handles JWT-secured webhook actions (e.g., clicking "Extend 2 Hours" from an email notification).

### **Database Models & Schemas**
*   `models/`: SQLAlchemy ORM definitions divided by domain (`config`, `control`, `inventory`, `system`).
*   `schemas/`: Pydantic models for strict input/output validation, divided by domain to match models.

### **Monitoring System (`backend/app/monitoring/`)**
*   `base_monitor.py`: Core polling engine for tracking background resource state changes.
*   `state_monitor.py`: Translates raw AWS states into the application's unified `RUNNING`/`STOPPED` states.
*   `flow/`: State machine flows managing cascading resource transitions (e.g., EKS -> ASG -> EC2).

### **Repositories (`backend/app/repositories/`)**
*   `control_repository.py`: Extracted complex SQLAlchemy DB logic for the Live Control dashboard.
*   `inventory_repository.py`: Extracted complex SQLAlchemy DB logic for the Inventory dashboard.

### **Service & Plugin Layer (`backend/app/services/`)**
*   `base_service.py`: Abstract base class for high-level cloud providers.
*   `base_handler.py`: The **Plugin Strategy Contract** defining how all individual cloud resources must implement discovery (`scan_region`) and control (`start`, `stop`, `get_state`).
*   `control_service.py`: The dynamic `importlib` router that automatically discovers and executes the correct plugin handler without hardcoded switch statements.
*   `notifier.py`: JWT-secured email notification engine for pre-shutdown warnings.

### **AWS Provider Implementation (`backend/app/services/aws/`)**
*   `service.py` & `session.py`: High-level AWS credential validation and Boto3 session management.
*   `scanner.py`: The high-performance sync orchestrator. It uses a strictly tuned `ThreadPoolExecutor(max_workers=20)` to fan out parallel requests across 18 AWS regions. This hard limit achieves perfect balance: it maximizes network throughput while preventing Python GIL (Global Interpreter Lock) contention and protecting the account from AWS API throttling (exponential backoff).
*   `discovery/`: The extraction layer for complex relational discovery (e.g., `ecs_discovery.py`, `asg_discovery.py`). Crucially, this layer leverages EC2 Launch Template `UserData` parsing for ultra-fast, single-API-call mappings instead of iterating heavy AWS APIs.
*   `handlers/direct_power/`: Plugins for resources with native start/stop actions (e.g., `ec2_handler.py`, `rds_handler.py`).
*   `handlers/scale_to_zero/`: Plugins for managing resource state by scaling capacity to zero (e.g., ASG, ECS). ECS clusters serve as hierarchical UI parents for their underlying EC2 instances.
*   `handlers/destroy_recreate/`: Plugins for managing ephemeral resources by destroying and recreating them.

---

## 2. Frontend Architecture (React.js)
The frontend is a React 19 application styled with Tailwind CSS, utilizing optimistic UI updates and polling for real-time synchronization.

### **Root & Configuration**
*   `frontend/src/index.js` & `App.js`: React mounting point and top-level routing structure.
*   `frontend/src/index.css`: Global CSS and Tailwind directives.
*   `frontend/tailwind.config.js`: Tailwind theme and custom color palette configuration.

### **API Client (`frontend/src/api/`)**
*   `api.js`: Axios instance configuration with global interceptors for intercepting and formatting network errors via toast notifications.
*   `config.js`: API calls related to the `CloudConfig` endpoints.
*   `control.js`: API calls related to syncing resources, fetching schedules, and executing power toggles.

### **Shared UI Components (`frontend/src/components/ui/`)**
*   `FilterBar.js`: Reusable navigation bar for applying global search filters (e.g., Account, Region, Range).
*   `CustomSelect.js`: Highly styled, custom dropdown select component used throughout the application.
*   `ResourceIcon.js`: Universal dynamic icon renderer mapping cloud service types to Lucide-React icons.

### **Dashboard Pages (`frontend/src/pages/`)**
*   **Config Page**
    *   `config/ConfigPage.js`: UI for entering cloud credentials, testing connections, and viewing verified accounts.
*   **Live Control Page**
    *   `control/ControlPage.js`: The main dashboard wrapping all tabs. Handles high-level state, global filtering, and triggering the multi-region sync.
    *   `control/ActionModal.js`: The dynamic popup modal that handles both manual overrides (Start/Stop) and automation schedule configurations.
*   **Control Tabs (`frontend/src/pages/control/tabs/`)**
    *   `OverviewTab.js`: High-level dashboard rendering 3 main widgets: Resource Distribution (Donut), Geographical Distribution (Bar Chart), and a live Recent Actions audit feed. Includes top KPIs (Running, Stopped, Terminated).
    *   `ResourcesTab.js`: The detailed data table listing all synced resources, their rich specifications (e.g., `t3.micro`), current power state, and manual action buttons.
    *   `ActivityLogTab.js`: The comprehensive audit log table displaying a historical timeline of all manual overrides and automated actions.
    *   `SettingsTab.js`: System configuration preferences rendered as a native vertical list layout (`SettingsRow.js`).

---

## 3. Full Project Blueprint

```text
Cloud-pulse-control-module/
├── backend
│   ├── app
│   │   ├── api
│   │   │   ├── actions.py
│   │   │   ├── cloud_config.py
│   │   │   ├── control.py
│   │   │   ├── inventory.py
│   │   │   └── notifications.py
│   │   ├── core
│   │   │   ├── config.py
│   │   │   ├── constants.py
│   │   │   ├── database.py
│   │   │   ├── scheduler.py
│   │   │   └── security.py
│   │   ├── models
│   │   │   ├── config
│   │   │   ├── control
│   │   │   ├── inventory
│   │   │   └── system
│   │   ├── monitoring
│   │   │   ├── flow
│   │   │   ├── base_monitor.py
│   │   │   └── state_monitor.py
│   │   ├── repositories
│   │   │   ├── control_repository.py
│   │   │   └── inventory_repository.py
│   │   ├── schemas
│   │   │   ├── config
│   │   │   ├── control
│   │   │   ├── inventory
│   │   │   └── system
│   │   └── services
│   │       ├── aws
│   │       ├── azure
│   │       ├── gcp
│   │       ├── base_handler.py
│   │       ├── base_service.py
│   │       ├── control_service.py
│   │       ├── inventory_service.py
│   │       ├── notifier.py
│   │       └── sync_tracker.py
│   ├── data
│   │   └── cloud_pulse_control.db
│   ├── main.py
│   └── requirements.txt
└── frontend
    ├── package.json
    ├── public
    │   └── index.html
    ├── src
    │   ├── App.js
    │   ├── api
    │   │   ├── api.js
    │   │   ├── config.js
    │   │   ├── control.js
    │   │   └── inventory.js
    │   ├── components
    │   │   └── ui
    │   ├── index.css
    │   ├── index.js
    │   └── pages
    │       ├── config
    │       ├── control
    │       └── inventory
    └── tailwind.config.js
```
