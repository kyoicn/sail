# Product Requirements Document (PRD): Sail

## 1. Product Vision
**Sail** is an interactive, spatio-temporal exploration platform designed to visualize historical events across time and geography. It aims to transform static historical data into a dynamic, immersive experience, allowing users to intuitively navigate through history, discover connections between events, and explore curated narratives.

## 2. Target Audience
- **History Enthusiasts**: Individuals looking for an engaging way to explore historical events.
- **students & Educators**: A tool for visualizing historical context and "when/where" relationships.
- **Researchers**: A high-level visualization tool for observing density and patterns in historical datasets.

## 3. Core Features

### 3.1. Interactive World Map
- **Global Visualization**: A scalable world map that displays events as interactive markers.
- **Dynamic LOD (Level of Detail)**: The map intelligently filters and clusters events based on zoom level, ensuring the view is never cluttered while maintaining important context (e.g., "Global" vs. "Local" views).
- **Navigation**:
    - Pan and zoom capabilities.
    - Click-to-center functionality.

### 3.2. Central Control Panel
- **Chrono-Navigation**: A unified timeline slider at the bottom of the screen allowing users to travel through time.
- **Dual-Layer Context**:
    - **Interactive Slider**: Precise control for selecting specific years or eras.
    - **Heatmap Overview**: A background visualization showing the density of events over the entire dataset range, helping users identify "busy" historical periods.
- **Adaptive Zoom**: The timeline allows for extreme precision, zooming from **thousands of years down to a single millisecond**. This vast range unlocks potential for diverse exploration scenarios, from civilization-scale epochs to split-second historical moments.
- **Smooth Transitions**: "Smooth jump" animations when navigating between distant dates.

### 3.3. Event Discovery & Details
- **Event Markers**: Distinct visual indicators for events on the map.
- **Detail Panel**: A slide-over panel providing in-depth information about a selected event:
    - **Header**: Title, Date, and Location.
    - **Media**: Hero image for visual context.
    - **Description**: Detailed summary and narrative.
    - **Sources**: Links to external references for further reading.

### 3.4. Curated Collections
- **Collections Sidebar**: A floating, always-visible sidebar (on desktop) allowing users to switch between different thematic datasets (e.g., "All Collections", "Roman Empire", "WWII").
- **Adaptive Interface**: The sidebar and timeline automatically adjust their layout to prevent overlap and maintain usability across different screen sizes (optimized for desktop >= 1200px).

### 3.5. Search & Filtering (Implicit/Planned)
- **Spatial Filtering**: The list of visible events automatically updates based on the map's current viewport.
- **Temporal Filtering**: Events outside the active time window are filtered out.

## 4. User Experience (UX) Principles
- **"Show, Don't Tell"**: Prioritize visual exploration (map/timeline) over text-heavy lists.
- **Fluidity**: All interactions (map movement, time travel, panel opening) should feel instantaneous and smooth.
- **Clean Aesthetic**: A minimalist, glassmorphism-inspired UI that floats above the map, keeping the focus on the data.
- **Context Awareness**: Always show the user *where* (map) and *when* (timeline) they are.

## 5. Technical Constraints (High Level)
- **Performance**: Must handle thousands of events without UI lag.
- **Responsiveness**: The layout adapts to various screen widths, ensuring key controls are always accessible.

## 6. Future Opportunities
- **Search**: Text-based search for specific events or figures.
- **Tours/Narratives**: Guided "tours" that automatically move the map and timeline to tell a specific story.
- **User Contributions**: Allowing users to suggest or edit events.
