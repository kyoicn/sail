# Project Progress Report: ChronoMap (Sail)
**Date:** 2025-12-06
**Status:** Active Development - Core Visualization & Debugging Phase

## 1. Executive Summary
The project has successfully implemented core visualization mechanics for the historical event map. Key achievements include a physics-based layout engine for event cards to prevent overlap, a dynamic marker scaling system that adapts to both temporal and spatial zoom levels, and a comprehensive Debug HUD for real-time state inspection.

## 2. Technical Features & Implementation

### A. Physics-Based Layout Engine (`lib/layout-engine.ts`)
To solve the problem of UI collision when multiple events are selected or clustered:
- **Algorithm:** Implemented a **Force-Directed Relaxation Solver** (2D).
- **Forces:**
    - **Anchor Spring:** Pulls cards towards an optimal radius from their map marker.
    - **Collision Repulsion:** Strong repulsive force between card bounding boxes to prevent overlap.
    - **Dot Repulsion:** Prevents cards from obscuring their own (or other) map markers.
- **Initialization:** Cards spawn at random 360° angles to find the nearest "energy well" (open space).
- **Optimization:** Runs for fixed iterations (80) per frame/update to ensure stability without performance cost.

### B. Smart Map Markers (`LeafletMap.tsx`)
Markers now visually communicate event significance and context:
- **Importance Scaling:** Marker size is a function of `EventData.importance` (1.0 - 10.0).
- **Zoom-Dependent Gain:**
    - At **Global View** (Zoom < 4): Importance contrast is exaggerated (Only major events pop).
    - At **Local View** (Zoom > 10): Sizes normalize to prevent clutter.
- **Time-Span Scaling:** Markers breathe/scale based on the visible timeline window (e.g., highlighting events when the timeline covers a specific decade).

### C. Advanced Debug HUD (`DebugHUD.tsx`)
A developer-facing overlay was built to facilitate data verification and state debugging:
- **State Hoisting:** `expandedEventIds` state was moved to `page.tsx` to share visibility context between the Map and HUD.
- **Inspector Modules:**
    - **Viewport Monitor:** Real-time Zoom, Center (Lat/Lng), and Bounds tracking.
    - **LOD Logic:** Displays current importance thresholds for rendering.
    - **Active/Open Lists:** Scrollable lists of Rendered vs. Expanded events.
- **Interactive Inspection:**
    - Clicking items in the HUD expands a detailed view.
    - Displays **Raw ID** (full UUID), **Precise Importance** (Float), and **High-Precision Coordinates** (6 decimal places).

### D. Data Schema Refinements (`types/index.ts`, `lib/constants.ts`)
- **Floating Point Importance:** `importance` field upgraded from integer to float (e.g., `9.8`, `8.2`) to allow fine-grained ranking of events.
- **Mock Data:** Updated `MOCK_EVENTS` with varied floating-point scores to test the rendering pipelines.
- **Strict Typing:** Resolved TypeScript interface discrepancies (e.g., `EventData.title` is a string, not an object).

## 3. Recent Fixes & Improvements
- **Bug Fix:** Fixed absolute positioning collisions in the `DebugHUD` by implementing a dedicated "Context" section.
- **Bug Fix:** Resolved `ReferenceError` for Leaflet module imports in server-side contexts (Next.js).
- **UX:** Implemented `break-all` CSS classes for long UUIDs in the inspector to prevent layout overflow.
- **Refactoring:** Hoisted state management from child components (`LeafletMap`) to the page root, enabling better component communication.

## 4. Next Steps
- **Timeline Integration:** Finalize the "two-tier viewport" synchronization between the timeline slider and the map.
- **Performance:** Stress test the physics engine with >50 simultaneous open cards.
- **Visual Polish:** Implement the smooth "Pop In/Out" transitions for markers (currently reverted for stability).
