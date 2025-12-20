
import { EventData } from '@sail/shared';
import { formatEventDateRange } from '../../lib/time-engine';
import { getLocationString } from '../../lib/utils';

export const getDotHtml = (dotColor: string, size: number): string => {
    return `
        <div style="
            width: ${size}px; height: ${size}px; 
            background: ${dotColor}; 
            border: 2px solid white; 
            border-radius: 50%; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: pointer;
        " class="map-dot"></div>
    `;
};

export const getLineHtml = (length: number, angle: number, color: string): string => {
    return `
        <div style="position: relative; width: 0; height: 0;">
            <div style="position: absolute; top: 0; left: 0; width: ${length}px; height: 2px; background: ${color}; transform-origin: 0 50%; transform: rotate(${angle}deg); opacity: 0.6;"></div>
        </div>
    `;
};

export const getCardHtml = (
    event: EventData,
    x: number,
    y: number
): string => {
    return `
       <div class="card-wrapper" style="
           position: absolute; left: 0; top: 0; 
           transform: translate(-50%, -100%) translate(${x}px, ${y}px); 
           width: 240px; 
           transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
           cursor: default; 
       ">
          <div style="background: white; border-radius: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.25); overflow: hidden; font-family: system-ui; position: relative;">
              
              <!-- Close Button -->
              <button class="close-btn" style="
                  position: absolute; top: 6px; right: 6px; 
                  width: 24px; height: 24px; 
                  background: white; border-radius: 50%; border: none; 
                  color: #1e293b; 
                  cursor: pointer; z-index: 50; display: flex; align-items: center; justify-content: center;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                  transition: background 0.1s;
                  padding: 0;
              ">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>

              ${event.imageUrl ? `<div style="height: 120px; width: 100%; background-image: url('${event.imageUrl}'); background-size: cover; background-position: center;"></div>` : ''}
              <div class="card-body" style="padding: 12px; cursor: pointer;">
                  <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">${event.title}</div>
                  <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                      <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                      <span style="font-size: 10px; font-weight: 500; background: #f3f4f6; color: #4b5563; padding: 2px 6px; rounded: 4px; display: flex; align-items: center; gap: 3px;">${getLocationString(event)}</span>
                  </div>
              </div>
          </div>
       </div>
    `;
};
