import L from 'leaflet';
import { EventData, LayoutResult } from '../types';

/**
 * lib/layout-engine.ts
 * Smart Layout Algorithm
 * ------------------------------------------------------------------
 * Handles the collision detection and positioning of event cards on the map.
 * * CORE PROBLEM:
 * When users zoom out, events overlap. Simple clustering hides data.
 * We want to KEEP data visible but organize it neatly.
 * * ALGORITHM:
 * 1. Projection: Convert Lat/Lng to screen pixels (x, y).
 * 2. Clustering: Group events that are too close horizontally (overlapping X).
 * 3. Spreading: Calculate new X positions to spread cards side-by-side.
 * 4. Staggering: Calculate Y offsets (arching) to prevent connector lines from crossing cards.
 */

// Configuration constants for the layout
const LAYOUT_CONFIG = {
  CARD_WIDTH: 250,      // Width of a standard card in pixels
  GAP: 20,              // Horizontal gap between cards in a cluster
  VERTICAL_STAGGER: 25  // Vertical step for the "arch" effect
};

/**
 * Intermediate interface for internal calculation
 */
interface ScreenItem {
  id: string;
  x: number;
  y: number;
  event: EventData;
}

/**
 * Calculates the final screen offsets for all active events to prevent overlap.
 * * @param events - List of currently active/filtered events.
 * @param map - The Leaflet map instance (needed for latLngToLayerPoint projection).
 * @returns A Map where key=EventID, value={offsetX, offsetY}.
 */
export function calculateSmartLayout(
  events: EventData[], 
  map: L.Map
): Map<string, LayoutResult> {
  const layoutMap = new Map<string, LayoutResult>();
  
  // 1. Projection & Sorting
  // Convert geographic coordinates to screen pixels
  const screenItems: ScreenItem[] = events.map(e => {
    const pt = map.latLngToLayerPoint([e.location.lat, e.location.lng]);
    return { id: e.id, x: pt.x, y: pt.y, event: e };
  }).sort((a, b) => a.x - b.x); // Sort by X to enable linear clustering

  if (screenItems.length === 0) return layoutMap;

  // 2. Clustering
  // Group items that physically overlap on the screen X-axis
  const clusters: ScreenItem[][] = [];
  if (screenItems.length > 0) {
    let currentCluster = [screenItems[0]];

    for (let i = 1; i < screenItems.length; i++) {
      const prev = currentCluster[currentCluster.length - 1];
      const curr = screenItems[i];
      
      // Check if distance is less than Card Width + Gap
      if (Math.abs(curr.x - prev.x) < (LAYOUT_CONFIG.CARD_WIDTH + LAYOUT_CONFIG.GAP)) {
        currentCluster.push(curr);
      } else {
        // Finalize current cluster and start a new one
        clusters.push(currentCluster);
        currentCluster = [curr];
      }
    }
    clusters.push(currentCluster);
  }

  // 3. Layout Calculation (Spread & Stagger)
  clusters.forEach(cluster => {
    if (cluster.length === 1) {
      // No collision: No offset needed
      layoutMap.set(cluster[0].id, { offsetX: 0, offsetY: 0 });
    } else {
      // Collision detected: Calculate spread positions
      
      // Calculate the visual center of the cluster's anchors
      const totalAnchorX = cluster.reduce((sum, item) => sum + item.x, 0);
      const averageAnchorX = totalAnchorX / cluster.length;
      
      // Total width required to display all cards side-by-side
      const totalSpreadWidth = cluster.length * LAYOUT_CONFIG.CARD_WIDTH + (cluster.length - 1) * LAYOUT_CONFIG.GAP;
      
      // Starting X position (leftmost edge) relative to screen
      const startScreenX = averageAnchorX - (totalSpreadWidth / 2) + (LAYOUT_CONFIG.CARD_WIDTH / 2);

      cluster.forEach((item, idx) => {
        // Target screen position for this specific card
        const targetScreenX = startScreenX + idx * (LAYOUT_CONFIG.CARD_WIDTH + LAYOUT_CONFIG.GAP);
        
        // Offset X: How far we need to move from the original anchor
        const offsetX = targetScreenX - item.x;
        
        // Offset Y (Staggering):
        // Create an "Arch" or "Pyramid" shape.
        // Items in the middle are higher (more negative Y) to avoid lines crossing outer items.
        const midIdx = (cluster.length - 1) / 2;
        const dist = Math.abs(idx - midIdx); // Distance from center
        const offsetY = -dist * LAYOUT_CONFIG.VERTICAL_STAGGER; 

        layoutMap.set(item.id, { offsetX, offsetY });
      });
    }
  });

  return layoutMap;
}