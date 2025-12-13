# Deployment Plan for Sail

This document outlines the steps to deploy the Sail application, including the Next.js frontend, Supabase database, and data pipeline components.

## Architecture Overview
- **Frontend**: Next.js (App Router) deployed on Vercel.
- **Backend/Database**: Supabase (PostgreSQL with PostGIS).
- **Data Pipeline**: Python scripts for data processing and ingestion (local execution).

---

## 1. Database Setup (Supabase)

### Prerequisites
- A [Supabase](https://supabase.com/) account.
- A new Supabase project created.

### Configuration
1.  **Enable PostGIS Extension**:
    - Go to the **Database** -> **Extensions** section in the Supabase dashboard.
    - Search for `postgis` and enable it.

2.  **Schema Initialization**:
    - Navigate to the **SQL Editor**.
    - Run the scripts located in `data-pipeline/sql/` in the following order:
        1.  `create_table.sql`: Sets up the `events` table and necessary indexes.
        2.  `create_rpc.sql`: Creates Remote Procedure Calls (RPCs) for geospatial queries (e.g., `get_events_in_viewport`).

3.  **API Keys**:
    - Go to **Project Settings** -> **API**.
    - Note down the `Project URL`, `anon public` key, and `service_role secret`.

---

## 2. Frontend Deployment (Vercel)

The frontend is a Next.js application located in the `sail-project/` directory.

### Prerequisites
- A [Vercel](https://vercel.com/) account.
- GitHub repository connected to Vercel.

### Deployment Steps
1.  **Import Project**:
    - In the Vercel dashboard, click **Add New** -> **Project**.
    - Select the `sail` repository.

2.  **Configure Project**:
    - **Root Directory**: Click "Edit" next to Root Directory and select `sail-project`.
    - **Framework Preset**: Ensure "Next.js" is selected.
    - **Build Command**: Default (`next build`) is correct.
    - **Install Command**: Default (`npm install` or equivalent) is correct.

3.  **Environment Variables**:
    Add the following environment variables in the Vercel project settings:
    
    | Variable Name | Description | Value Source |
    | :--- | :--- | :--- |
    | `SUPABASE_URL` | Supabase Project URL | Supabase Dashboard (Settings -> API) |
    | `SUPABASE_ANON_KEY` | Supabase Public Anon Key | Supabase Dashboard (Settings -> API) |
    | `NEXT_PUBLIC_DATASET` | (Optional) Dataset toggle | `prod` or `local` (Defaults to prod if omitted) |

4.  **Deploy**:
    - Click **Deploy**. Vercel will build and deploy the application.

---

## 3. Data Pipeline Setup

The data pipeline runs separately (typically locally or on a scheduler) to feed data into the database.

### Local Setup
1.  **Navigate to Directory**:
    ```bash
    cd data-pipeline
    ```

2.  **Python Environment**:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

3.  **Environment Configuration**:
    Create a `.env` file in `data-pipeline/` with the following keys:
    ```ini
    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_SERVICE_KEY=your-service-role-secret
    # Only if running event extraction
    OPENAI_API_KEY=sk-...
    ```

### Running Data Imports
To bulk import processed events (JSON) into Supabase:
```bash
python scripts/bulk_import_supabase.py --input_dir data/output/ --table_name events
```

---

## 4. Operational Maintenance

- **Frontend Updates**: Pushing to the `main` branch will automatically trigger a new deployment on Vercel.
- **Data Updates**: Run the Python `bulk_import_supabase.py` script whenever new data needs to be ingested.
- **Schema Changes**: Apply database migrations manually via the Supabase SQL Editor.
