# **Product Requirements Document (PRD): Sail (v2.0)**

## **1\. Product Vision**

**Sail** is an interactive, spatio-temporal exploration platform designed to visualize historical events across time and geography. It aims to transform static historical data into a dynamic, immersive experience, allowing users to intuitively navigate through history, discover connections between events, and explore curated narratives.

## **2\. Target Audience**

* **History Enthusiasts**: Individuals looking for an engaging way to explore historical events.  
* **Students & Educators**: A tool for visualizing historical context and "when/where" relationships.  
* **Researchers**: A high-level visualization tool for observing density and patterns in historical datasets.

## **3\. Core Features**

### **3.1. Interactive World Map**

* **Global Visualization**: A scalable world map that displays events as interactive markers.  
* **Dynamic LOD (Level of Detail)**: The map intelligently filters and clusters events based on zoom level, ensuring the view is never cluttered while maintaining important context (e.g., "Global" vs. "Local" views).  
* **Navigation**:  
  * Pan and zoom capabilities.  
  * Click-to-center functionality.

### **3.2. Central Control Panel (Updated v2.0)**

The control panel is the primary interface for temporal navigation. It operates in two distinct modes to balance "Macro" trends with "Micro" precision.

#### **3.2.1 Mode A: Exploration Mode (Default State)**

*Goal: Provide a high-level overview of the active historical window.*

* **Header Display**: Shows the **Time Range** currently visible on the timeline (e.g., 1600 AD — 1700 AD).  
* **Timeline Interaction**:  
  * Acts as a "Brush" or viewport selector.  
  * Displays the **Density Waveform** (heatmap of event frequency).  
  * **No Slider Handle**: The specific "current time" handle is hidden to reduce cognitive load.  
* **Hover State**: Hovering the waveform displays a "ghost" line and date to preview potential selections.

#### **3.2.2 Mode B: Investigation Mode (Specific Time State)**

*Goal: Pinpoint exact moments for detailed analysis.*

* **Trigger**: Activated by clicking the "Time Range" header, clicking anywhere on the waveform, or clicking a specific event marker.  
* **Header Display**: Shows the **Specific Date** (e.g., 1656 AD).  
* **Timeline Interaction**:  
  * The **Slider Handle** (Blue Circle) appears at the active date.  
  * **Magnetic Scrubbing**: When dragging the slider, it "snaps" to tick marks of major events to aid precision.  
* **Deep Zoom (Drill-Down)**:  
  * Interaction: Clicking the "Year" text (e.g., "1656") triggers a zoom animation.  
  * Result: The timeline scale shifts from **Centuries/Decades** to **Months/Days** of that specific year.

#### **3.2.3 Semantic Context Engine (Context Awareness)**

*Goal: Answer "Where and When am I?" dynamically.*

* **Display**: A subtitle below the main Header Date (e.g., *1656 AD* \-\> **"Edo Period"**).  
* **Logic Rule (Center-Point Dominance)**:  
  1. **Global Zoom**: Displays broad chronological era (e.g., "17th Century", "Late Middle Ages").  
  2. **Regional Zoom**: Calculates the geographic center of the current map viewport. Queries the database for the dominant political/cultural entity at that coordinate for the active time.  
     * *Example:* Viewport center is Tokyo \+ Date is 1603 \= Display **"Edo Period"**.  
     * *Example:* Viewport center is Paris \+ Date is 1793 \= Display **"French Revolution"**.

### **3.3. Event Discovery & Details**

* **Event Markers**: Distinct visual indicators for events on the map.  
* **Detail Panel**: A slide-over panel providing in-depth information about a selected event:  
  * **Header**: Title, Date, and Location.  
  * **Media**: Hero image for visual context.  
  * **Description**: Detailed summary and narrative.  
  * **Sources**: Links to external references for further reading.  
* **Marker Tooltips**: Hovering over a map marker displays a small tooltip with the Event Title (Quick Preview).

### **3.4. Curated Collections**

* **Collections Sidebar**: A floating, always-visible sidebar (on desktop) allowing users to switch between different thematic datasets (e.g., "All Collections", "Roman Empire", "WWII").  
* **Adaptive Interface**: The sidebar and timeline automatically adjust their layout to prevent overlap and maintain usability across different screen sizes.

### **3.5. Playback & Automation (New v2.0)**

*Goal: Allow passive observation of historical changes (Civilization-style).*

* **Controls**: A playback cluster (Play/Pause, Speed 1x/2x/4x) adjacent to the date header.  
* **Behavior**:  
  * Clicking **Play** automatically enters **Investigation Mode**.  
  * The date counter increments automatically.  
  * Map markers appear/disappear in real-time sync with the counter.  
  * **Smooth Transitions**: New markers fade in; expired markers fade out.

### **3.6. Search & Filtering (Implicit/Planned)**

* **Spatial Filtering**: The list of visible events automatically updates based on the map's current viewport.  
* **Temporal Filtering**: Events outside the active time window are filtered out.

## **4\. User Experience (UX) Principles**

* **"Show, Don't Tell"**: Prioritize visual exploration (map/timeline) over text-heavy lists.  
* **Fluidity**: All interactions (map movement, time travel, panel opening) should feel instantaneous.  
* **Clean Aesthetic**: A minimalist, glassmorphism-inspired UI that floats above the map.  
* **Context Awareness**: Always show the user *where* (map) and *when* (timeline) they are using Semantic Context labels.

## **5\. Technical Constraints & Performance**

* **Map Performance**: Must maintain 60fps rendering for up to 2,000 visible markers.  
* **Playback Optimization**: The "Play" function must pre-fetch upcoming data (buffered loading) to prevent "stuttering" as the timeline advances.  
* **Responsiveness**: Mobile layouts must collapse the "Collections Sidebar" into a drawer menu.

## **6\. Product Roadmap**

### **Phase 1: The Foundation (MVP)**

*Focus: Core Visualization & Stability*

* **Map Engine**: Implementation of Dynamic LOD and Viewport Filtering.  
* **Control Panel v1**: Basic linear slider, Density Waveform, and Year display.  
* **Data Layer**: JSON-based event loading, Click-to-view Detail Panel.

### **Phase 2: The Time Machine (Current Focus)**

*Focus: Immersion, Playback, and Context*

* **Dual-Mode Control**: Implementation of "Exploration" vs. "Investigation" states.  
* **Deep Zoom**: Interaction to drill down from Years to Days.  
* **Semantic Context**: Integration of the "Era Lookup" logic based on viewport center.  
* **Playback Engine**: Auto-incrementing time loop with speed controls.

### **Phase 3: The Navigator (Future)**

*Focus: Discovery & Narrative*

* **Search**: Global text search for specific figures or events.  
* **Narrative Tours**: Scripted camera movements that guide users through a storyline (e.g., "The Silk Road expansion").  
* **User Contributions**: "Suggest an Edit" workflow for community data improvement.