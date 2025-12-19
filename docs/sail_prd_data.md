# **Core Data Primitives: Unified Event & Period**

**Context:** Conceptual definitions for the Sail data model.

## **1\. The Unified Event Entity**

**Definition:** The single fundamental unit of historical data. There is no rigid distinction between "Atomic" and "Container" types in the database. Instead, an Event's **behavior** is determined dynamically by its relationships.

* **Schema Concept:** A recursive tree structure.  
  * Every event has basic properties: id, title, start\_time, end\_time, location.  
  * Every event has an optional children array (list of other Event IDs).

### **Dynamic Behavior States**

**State A: The "Leaf" (Atomic Behavior)**

* **Condition:** The event has **zero** children.  
* **UI Representation:** Renders as a discrete **Dot/Marker** on the map.  
* **Search Action:** Zoom map to the specific coordinate.

**State B: The "Node" (Container Behavior)**

* **Condition:** The event has **one or more** children.  
* **UI Representation:** Renders as a **Visual Grouping** (e.g., trajectory line, heatmap, or polygon) connecting its children.  
* **Search Action:** Enters **"Thread Mode"** (Focus Mode), filtering the timeline and map to show only this event and its descendants.  
* **Example:**  
  * *Event:* "1988 Seoul Olympics"  
  * *If data is sparse:* It has no children → Appears as a Dot.  
  * *If data is rich:* It contains "Opening Ceremony" (Child) → Becomes a navigable Thread.

## **2\. The Historical Period (The Context)**

**Definition:** A background spatio-temporal state that describes the "Era" of a specific geographic region.

* **Concept:** The "Stage." Unlike Events, Periods do not "happen"—they exist as the backdrop *for* events.  
* **Role:**  
  * **Semantic Labeling:** providing the answer to "Where and when am I?" (e.g., "Edo Period").  
  * **Visual Layering:** Coloring the map background to show political boundaries of the era.  
* **Distinction:** A Period is **never** a child of an Event. It is a separate reference layer.

## **3\. Key Logic & relationships**

### **A. Recursive Nesting (Event-to-Event)**

* **Logic:** Event (Parent) ↔ Event (Child).  
* **Depth:** Nesting can be infinite (War → Theater → Battle → Skirmish).  
* **Navigation:** Clicking a Parent "Node" enters its context. Inside that context, its immediate Children act as the interactive elements.

### **B. Subject vs. Setting (Event vs. Period)**

* **Event (The Story):** The foreground content. The things the user clicks, searches for, and follows.  
* **Period (The Setting):** The background context. The labels that appear automatically based on where the user looks.