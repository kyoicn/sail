import L from 'leaflet';
import { EventData, LayoutResult } from '../types';

/**
 * lib/layout-engine.ts
 * Physics-Based Layout Solver
 * ------------------------------------------------------------------
 * Uses a 2D force-relaxation algorithm to position cards.
 * 
 * FORCES:
 * 1. Anchor Spring: Pulls card towards its ideal position (centered above the dot).
 * 2. Collision Repulsion: Pushes overlapping cards apart.
 * 
 * This ensures cards stay near their event but naturally slide away 
 * from each other to avoid visual overlapping.
 */

const CONFIG = {
  CARD_WIDTH: 260,  // Base width + margin
  CARD_HEIGHT: 180, // Approx height + margin
  ITERATIONS: 60,   // Solver steps (enough for convergence ~10 nodes)
  K_ANCHOR: 0.08,   // Strength of pull towards dot
  K_REPULSE: 0.5,   // Strength of push away from overlap
  ANCHOR_OFFSET_Y: 20 // Vertical shift to place ideal anchor slightly above the dot
};

interface LayoutNode {
  id: string;
  // ideal position (anchor)
  tx: number;
  ty: number;
  // current simulation position
  x: number;
  y: number;
  // Velocity (optional for simple relaxation, but good for stability)
  vx: number;
  vy: number;
}

export function calculateSmartLayout(
  events: EventData[],
  map: L.Map
): Map<string, LayoutResult> {
  const layoutMap = new Map<string, LayoutResult>();

  if (events.length === 0) return layoutMap;

  // 1. Initialize Nodes
  // Place them at their 'Ideal' position initially (centered above dot)
  const nodes: LayoutNode[] = events.map(e => {
    const pt = map.latLngToLayerPoint([e.location.lat, e.location.lng]);
    return {
      id: e.id,
      tx: pt.x,
      ty: pt.y - CONFIG.ANCHOR_OFFSET_Y, // Target is slightly above the dot
      x: pt.x,
      y: pt.y - CONFIG.ANCHOR_OFFSET_Y,
      vx: 0,
      vy: 0
    };
  });

  // 2. Run Relaxation Loop
  for (let i = 0; i < CONFIG.ITERATIONS; i++) {
    // A. Apply Forces
    nodes.forEach(node => {
      // 1. Anchor Spring (Pull to Target)
      const dx = node.tx - node.x;
      const dy = node.ty - node.y;
      node.vx += dx * CONFIG.K_ANCHOR;
      node.vy += dy * CONFIG.K_ANCHOR;

      // 2. Collision Repulsion
      nodes.forEach(other => {
        if (node === other) return;

        const distDx = node.x - other.x;
        const distDy = node.y - other.y;

        // Check intersection bounds
        // We treat cards as rectangles centered at x,y
        const w = CONFIG.CARD_WIDTH;
        const h = CONFIG.CARD_HEIGHT;

        const overlapX = w - Math.abs(distDx);
        const overlapY = h - Math.abs(distDy);

        if (overlapX > 0 && overlapY > 0) {
          // Collision detected! Push apart.
          // Push along the axis of least overlap (easier escape)
          if (overlapX < overlapY) {
            const push = overlapX * CONFIG.K_REPULSE;
            // Add jitter to break perfect vertical symmetry
            const sign = (distDx !== 0) ? Math.sign(distDx) : (Math.random() - 0.5);
            node.vx += sign * push;
          } else {
            const push = overlapY * CONFIG.K_REPULSE;
            const sign = (distDy !== 0) ? Math.sign(distDy) : (Math.random() - 0.5);
            node.vy += sign * push;
          }
        }
      });
    });

    // B. Integrate Position (Dampen velocity)
    nodes.forEach(node => {
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= 0.6; // Friction
      node.vy *= 0.6;
    });
  }

  // 3. Compute Final Offsets
  // Return offset from the *Original Dot Position* (which is node.tx, node.ty+ANCHOR_OFFSET_Y)
  nodes.forEach(node => {
    // We want the offset relative to the dot's pixel coordinates
    // Dot X = tx
    // Dot Y = ty + ANCHOR_OFFSET_Y

    // Final Card Center = node.x, node.y
    // We want offset from dot
    const offsetX = node.x - node.tx;
    const offsetY = node.y - (node.ty + CONFIG.ANCHOR_OFFSET_Y);

    layoutMap.set(node.id, { offsetX, offsetY });
  });

  return layoutMap;
}