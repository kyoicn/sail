import { EventData } from '@sail/shared';
import { formatEventDateRange } from '../../lib/time-engine';
import { getLocationString } from '../../lib/utils';
import { DotStyleConfig, SHAPE_CONFIGS, EFFECT_CONFIGS } from '../../lib/constants';

export const getDotHtml = (dotColor: string, size: number, style: DotStyleConfig): string => {
    const finalSize = size;

    const shapeConfig = SHAPE_CONFIGS[style.shape] || SHAPE_CONFIGS['circle'];
    const effectConfig = EFFECT_CONFIGS[style.effect] || EFFECT_CONFIGS['none'];

    const borderRadius = shapeConfig.borderRadius;
    const transform = shapeConfig.transform || '';
    const pulseClass = shapeConfig.className || '';
    const boxShadow = style.effect === 'none' ? '0 2px 4px rgba(0,0,0,0.3)' : effectConfig.getBoxShadow(dotColor);

    // [CENTRALIZED LOGIC] Consume properties from config
    const background = shapeConfig.isHollow ? 'transparent' : dotColor;
    const border = shapeConfig.isHollow
        ? `${style.borderWidth + 1}px solid ${dotColor}`
        : `${style.borderWidth}px solid white`;
    const outline = shapeConfig.hasOuterWhiteBorder ? '1px solid white' : 'none';

    return `
        <div class="map-dot ${pulseClass}" style="
            width: ${finalSize}px; 
            height: ${finalSize}px; 
            background: ${background}; 
            border: ${border}; 
            outline: ${outline};
            outline-offset: -1px;
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

export const getArrowHtml = (color: string, angle: number): string => {
    return `
        <div style="
            transform: rotate(${angle}deg); 
            width: 12px; 
            height: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="${color}" style="opacity: 0.8;">
                <path d="M0,0 L12,6 L0,12 L2,6 z" />
            </svg>
        </div>
    `;
};

export const getCardHtml = (
    event: EventData,
    x: number,
    y: number,
    hasChildren: boolean = false,
    focusStack: string[] = []
): string => {
    const isAlreadyInStack = focusStack.includes(event.id);
    const showFocusTab = hasChildren && !isAlreadyInStack;

    // [STYLE UPDATE] Use drop-shadow on wrapper for unified shape, remove individual box-shadows
    // Adjust border-radius of main card to be flat on right if focus tab is shown.
    const mainRadius = showFocusTab ? '12px 0 0 12px' : '12px';

    return `
       <div class="card-wrapper" style="
           position: absolute; left: 0; top: 0; 
           transform: translate(-50%, -100%) translate(${x}px, ${y}px); 
           width: 240px; 
           transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
           cursor: default; 
           pointer-events: none; /* Let children handle pointer events */
           overflow: visible !important; /* Ensure no clipping */
           filter: drop-shadow(0 8px 25px rgba(0,0,0,0.25)); /* Consolidated Shadow */
       ">
          <!-- Main Card -->
          <div style="
              pointer-events: auto;
              background: white; 
              border-radius: ${mainRadius}; 
              /* box-shadow removed in favor of wrapper drop-shadow */
              overflow: hidden; font-family: system-ui; position: relative; z-index: 10;
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
                  <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px; padding-right: 20px;">
                    ${event.title} 
                    ${hasChildren ? `<span style="font-size: 10px; color: #64748b; font-weight: 500;">[${event.children?.length}]</span>` : ''}
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                      <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                      <span style="font-size: 10px; font-weight: 500; background: #f3f4f6; color: #4b5563; padding: 2px 6px; rounded: 4px; display: flex; align-items: center; gap: 3px;">${getLocationString(event)}</span>
                  </div>
              </div>
          </div>

          <!-- Focus Tab Expansion -->
          ${showFocusTab ? `
            <div class="focus-btn" style="
                pointer-events: auto;
                position: absolute; 
                top: 0; 
                bottom: 0;
                right: -40px; 
                width: 40px;
                background: #f8fafc; /* Slightly darker than white to distinguish area */
                border-radius: 0 12px 12px 0;
                /* box-shadow removed */
                border-left: 1px solid #e2e8f0; /* Subtle divider */
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 9; /* Behind main card visually? No, adjacent */
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
