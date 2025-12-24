import { EventData } from '@sail/shared';
import { formatEventDateRange } from '../../lib/time-engine';
import { getLocationString } from '../../lib/utils';
import { DotStyleConfig } from '../../lib/constants';

export const getDotHtml = (dotColor: string, size: number, style: DotStyleConfig): string => {
    const finalSize = size * style.sizeMultiplier;

    let borderRadius = '50%';
    let transform = '';

    if (style.shape === 'square') {
        borderRadius = '4px';
    } else if (style.shape === 'diamond') {
        borderRadius = '2px';
        transform += 'rotate(45deg)';
    }

    let boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    if (style.effect === 'glow') {
        boxShadow = `0 0 10px ${dotColor}, 0 0 20px ${dotColor}44`;
    } else if (style.effect === 'shadow') {
        boxShadow = '2px 4px 8px rgba(0,0,0,0.5)';
    } else if (style.effect === 'soft') {
        boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    }

    const borderStyle = `${style.borderWidth}px solid white`;
    const isRing = style.shape === 'ring';
    const background = isRing ? 'transparent' : dotColor;
    const ringBorder = isRing ? `${style.borderWidth + 1}px solid ${dotColor}` : borderStyle;

    const pulseClass = style.shape === 'pulse' ? 'animate-pulse-slow' : '';

    return `
        <div class="map-dot ${pulseClass}" style="
            width: ${finalSize}px; 
            height: ${finalSize}px; 
            background: ${background}; 
            border: ${ringBorder}; 
            border-radius: ${borderRadius}; 
            box-shadow: ${boxShadow};
            transform: ${transform};
            cursor: pointer;
            opacity: 1.0;
            transition: all 0.2s ease;
        ">
        </div>
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
    y: number,
    hasChildren: boolean = false
): string => {
    return `
       <div class="card-wrapper" style="
           position: absolute; left: 0; top: 0; 
           transform: translate(-50%, -100%) translate(${x}px, ${y}px); 
           width: 240px; 
           transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
           cursor: default; 
           pointer-events: none; /* Let children handle pointer events */
           overflow: visible !important; /* Ensure no clipping */
       ">
          <!-- Main Card -->
          <div style="
              pointer-events: auto;
              background: white; border-radius: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.25); 
              overflow: hidden; font-family: system-ui; position: relative; z-index: 10; /* High z-index */
          ">
              
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
                  <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">
                    ${event.title} 
                    <span style="font-size: 10px; color: red;">${hasChildren ? `[C: ${event.children?.length}]` : '[No Kids]'}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                      <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                      <span style="font-size: 10px; font-weight: 500; background: #f3f4f6; color: #4b5563; padding: 2px 6px; rounded: 4px; display: flex; align-items: center; gap: 3px;">${getLocationString(event)}</span>
                  </div>
              </div>
          </div>

          <!-- Focus Tab Expansion -->
          ${hasChildren ? `
            <div class="focus-btn" style="
                pointer-events: auto;
                position: absolute; 
                top: 0; 
                bottom: 0;
                right: -48px; 
                width: 48px;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(8px);
                border-radius: 0 12px 12px 0;
                box-shadow: 4px 8px 25px rgba(0,0,0,0.15);
                border-left: 1px solid rgba(0,0,0,0.05);
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1;
                transition: background 0.2s;
            ">
                <div style="writing-mode: vertical-rl; transform: rotate(180deg); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin-bottom: 4px;">
                    Focus
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </div>
          ` : ''}
       </div>
    `;
};
