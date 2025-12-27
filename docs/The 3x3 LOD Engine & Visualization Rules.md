# **Product Strategy: The 3x3 LOD Engine & Visualization Rules**

**Objective:** Define rendering rules for the intersection of Spatial Zoom (Map) and Temporal Zoom (Timeline) to ensure the interface remains usable at any scale.

## **1\. The Space-Time Definitions**

We categorize the user's viewport into three distinct levels for both dimensions.

| Level | Spatial Scope (Map Zoom) | Temporal Scope (Timeline Range) |
| :---- | :---- | :---- |
| **Macro** | **Global / Continental** (Zoom 1-4) *The Earth, Eurasia* | **Civilizational** (\> 100 Years) *"The Roman Empire", "The Bronze Age"* |
| **Medium** | **Regional / National** (Zoom 5-10) *France, The Mediterranean* | **Generational** (5 \- 100 Years) *"Reign of Napoleon", "WWII"* |
| **Micro** | **Local / City** (Zoom 11+) *Rome, Waterloo Battlefield* | **Momentary** (\< 1 Year) *"Battle of Midway", "Great Fire of London"* |

## **2\. The 3x3 Interaction Matrix (With Concrete Examples)**

This matrix defines **what** renders in each state.

### **Row 1: Macro Space (Global View)**

| Time State | Macro Time (Millennia) | Medium Time (Decades) | Micro Time (Days) |
| :---- | :---- | :---- | :---- |
| **User Intent** | *"How did humanity spread?"* | *"How did empires shift?"* | *"What happened on VJ Day?"* |
| **Visual Strategy** | **Meta-Flows & Heatmaps** | **Polygons & Trajectories** | **Simultaneity Pins** |
| **Concrete Example** | **The Migration Period (300-700 AD)** • **Hide:** Individual tribal movements. • **Show:** A "Meta-Flow" (broad arrow) sweeping from the Steppes to Europe. • **Data:** Explicit MigrationFlow entity, not derived events. | **The Scramble for Africa (1880-1914)** • **Show:** Polygon borders of colonial powers expanding/shrinking. • **Show:** "Berlin Conference" as a Star Icon (Importance 10). | **The Moon Landing (July 20, 1969\)** • **Show:** Pin on Florida (Launch). • **Show:** Pin on Houston (Control). • **Show:** Pin on Pacific (Recovery). • **Context:** "Ghost" pins of Cold War tension sites (Moscow, Berlin). |

### **Row 2: Medium Space (Regional View) — *The "Campaign" Layer***

| Time State | Macro Time (Millennia) | Medium Time (Decades) | Micro Time (Days) |
| :---- | :---- | :---- | :---- |
| **User Intent** | *"History of the Mediterranean"* | *"The Napoleonic Wars"* | *"The Normandy Landings"* |
| **Visual Strategy** | **Era Clustering** | **Active Narratives** | **Tactical Fronts** |
| **Concrete Example** | **Italy (500 BC \- 1500 AD)** • **Cluster 1:** "Roman Republic Era" (Click to zoom time). • **Cluster 2:** "Renaissance Era". • **Don't Show:** Every single Pope's election. | **Magellan's Voyage (1519-1522)** • **Show:** The Ship Icon moving along a path. • **Trail:** Gold line behind (Past), Dotted line ahead (Future). • **Events:** "Mutiny at San Julian" appears as the ship passes. | **D-Day (June 6, 1944\)** • **Show:** Specific beaches (Omaha, Utah). • **Show:** Paratrooper drop zones inland. • **Show:** Frontline polygon pushing inland hour-by-hour. |

### **Row 3: Micro Space (Local View)**

| Time State | Macro Time (Millennia) | Medium Time (Decades) | Micro Time (Days) |
| :---- | :---- | :---- | :---- |
| **User Intent** | *"Deep History of London"* | *"Haussmann's Renovation of Paris"* | *"The JFK Assassination"* |
| **Visual Strategy** | **Vertical Stacking (Sidebar)** | **Development Phases** | **Maximum Fidelity** |
| **Concrete Example** | **Jerusalem (Temple Mount)** • **Map:** One "Stack" Pin. • **Interaction:** Click opens Sidebar timeline: "Solomon's Temple" \-\> "Second Temple" \-\> "Dome of the Rock". | **Eiffel Tower Construction (1887-1889)** • **Visual:** Icon changes from "Foundation" \-\> "Framework" \-\> "Complete". • **Events:** "Opening Ceremony" pin appears at the base. | **Dealey Plaza (Nov 22, 1963\)** • **Show:** The motorcade route (line). • **Show:** The car location (moving dot). • **Show:** The Repository window (static pin). • **Detail:** Popups open automatically. |

## **3\. Visualization Mechanics**

### **A. Dynamic Content & Aggregation**

For massive movements (Migrations) or long processes (Construction), we use specialized entities:

1. **The "Meta-Flow" (Macro/Macro):**  
   * **Definition:** A high-level data object representing a trend (e.g., "Indo-European Expansion").  
   * **Visual:** A broad, directional arrow or heatmap stream.  
   * **Data Source:** Explicitly curated polygons/paths. **NOT** derived from aggregating thousands of point events on the fly.  
   * **Behavior:** As the user zooms in (to Medium Space), the Meta-Flow dissolves into specific Trajectory Lines (e.g., "Visigoth Route").  
2. **The "Head & Tail" Model (Medium/Medium):**  
   * **Head:** The current active state (e.g., The Army Unit). Rendered distinct and bright.  
   * **Tail:** The history of that object. Rendered as a path.  
   * **Implementation:** The frontend interpolates position between start\_location and end\_location based on the timeline percentage.

### **B. Ghosting (Contextual Decay)**

Events should not "blink" out of existence instantly.

* **Active (t \= 0):** Opacity: 1.0, Scale: 1.0. Interactive.  
* **Cooling (t \+ 1 week):** Opacity: 0.6, Scale: 0.8, Saturation: 0.5. Still Interactive.  
* **Echo (t \+ 1 month):** Opacity: 0.3, Greyscale. Not Interactive (Background texture).  
* **Gone:** Removed from render.

### **C. The "LOD Throttle" Algorithm**

To maintain 60fps, the render loop calculates a VisibilityScore for every entity.

Score \= (Importance \* ZoomFactor) / DataDensity

* **Rule 1 (The Thread Override):** If the user is in a "Thread" (e.g., Magellan), ALL events in that thread get Score \= MAX. They are never hidden.  
* **Rule 2 (The City Brake):** If SpatialZoom \> CityLevel AND TimeRange \> 100 Years, force **Clustering**. Do not try to render individual events.