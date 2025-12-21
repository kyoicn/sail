import React from 'react';
import { EventData } from '@sail/shared';
import { getAstroYear, toSliderValue } from '../../../lib/time-engine';

interface TimelineTooltipProps {
  hoveredEventId: string | null;
  interactionMode: 'exploration' | 'investigation' | 'playback';
  events: EventData[];
  viewRange: { min: number, max: number };
}

export const TimelineTooltip: React.FC<TimelineTooltipProps> = ({
  hoveredEventId,
  interactionMode,
  events,
  viewRange
}) => {
  if (!hoveredEventId || interactionMode !== 'investigation') return null;

  const event = events.find(e => e.id === hoveredEventId);
  if (!event) return null;

  const span = viewRange.max - viewRange.min;
  const startFraction = getAstroYear(event.start) - event.start.year;
  const sliderVal = toSliderValue(event.start.year) + startFraction;
  const percent = (sliderVal - viewRange.min) / span;

  // If out of view, don't show (should be filtered by interaction logic anyway)
  if (percent < 0 || percent > 1) return null;

  const xPercent = percent * 100;

  return (
    <div
      className="absolute bottom-1/2 left-0 mb-6 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded shadow-lg whitespace-nowrap z-50 pointer-events-none transform -translate-x-1/2 transition-opacity duration-150"
      style={{ left: `${xPercent}% ` }}
    >
      {event.title}
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-slate-800"></div>
    </div>
  );
};
