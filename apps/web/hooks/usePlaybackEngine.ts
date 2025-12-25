import { useCallback, useEffect } from 'react';
import { EventData } from '@sail/shared';
import { ZOOM_SCALES } from '../lib/time-engine';

interface UsePlaybackEngineProps {
  setCurrentDate: React.Dispatch<React.SetStateAction<number>>;
  viewRange: { min: number, max: number };
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  interactionMode: 'exploration' | 'investigation' | 'playback';
  spatiallyFilteredEvents: EventData[];
  setExpandedEventIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setPlayedEventIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function usePlaybackEngine({
  setCurrentDate,
  viewRange,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  interactionMode,
  spatiallyFilteredEvents,
  setExpandedEventIds,
  setPlayedEventIds
}: UsePlaybackEngineProps) {

  const handleManualStep = useCallback(() => {
    // Step aligned with Time Engine Zoom Scales
    const span = viewRange.max - viewRange.min;
    let stepSize = ZOOM_SCALES.SECOND;

    if (span >= ZOOM_SCALES.MILLENNIUM * 2) stepSize = ZOOM_SCALES.CENTURY;
    else if (span >= ZOOM_SCALES.CENTURY * 2) stepSize = ZOOM_SCALES.DECADE;
    else if (span >= ZOOM_SCALES.DECADE * 2) stepSize = ZOOM_SCALES.YEAR;
    else if (span >= ZOOM_SCALES.YEAR * 2) stepSize = ZOOM_SCALES.MONTH;
    else if (span >= ZOOM_SCALES.MONTH * 2) stepSize = ZOOM_SCALES.DAY;
    else if (span >= ZOOM_SCALES.DAY * 2) stepSize = ZOOM_SCALES.HOUR;
    else if (span >= ZOOM_SCALES.HOUR * 2) stepSize = ZOOM_SCALES.MINUTE;
    else stepSize = ZOOM_SCALES.SECOND;

    setCurrentDate((prev: number) => {
      const nextDate = prev + stepSize;

      if (nextDate > viewRange.max) {
        setIsPlaying(false);
        return viewRange.max;
      }

      // Event Activation Logic
      // Scan spatiallyFilteredEvents (includes low importance) so we activate even small events
      const newActiveEvents = spatiallyFilteredEvents.filter(e =>
        e.start.year > prev && e.start.year <= nextDate
      );

      if (newActiveEvents.length > 0) {
        setExpandedEventIds((prevSet: Set<string>) => {
          const next = new Set(prevSet);
          newActiveEvents.forEach(e => next.add(e.id));
          return next;
        });

        // Add to Played Events (Persistent Dots)
        setPlayedEventIds(prevSet => {
          const next = new Set(prevSet);
          newActiveEvents.forEach(e => next.add(e.id));
          return next;
        });

        // Schedule Auto-Close for events without end date (2 seconds)
        newActiveEvents.forEach(event => {
          const hasDuration = event.end && event.end.year > event.start.year;
          if (!hasDuration) {
            setTimeout(() => {
              setExpandedEventIds(current => {
                const next = new Set(current);
                next.delete(event.id);
                return next;
              });
            }, 2000);
          }
        });
      }

      // Collapse Events with End Dates that have passed
      setExpandedEventIds(prevSet => {
        const next = new Set(prevSet);
        let changed = false;
        prevSet.forEach(id => {
          // Use spatiallyFilteredEvents for lookup as it's the superset of relevant events
          const event = spatiallyFilteredEvents.find(e => e.id === id);
          if (event && event.end && event.end.year <= nextDate) {
            next.delete(id);
            changed = true;
          }
        });
        return changed ? next : prevSet;
      });

      return nextDate;
    });

  }, [viewRange, spatiallyFilteredEvents, setIsPlaying, setCurrentDate, setExpandedEventIds, setPlayedEventIds]);

  // Auto-Play Loop
  useEffect(() => {
    if (interactionMode !== 'playback' || !isPlaying) return;

    const interval = setInterval(() => {
      handleManualStep();
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [interactionMode, isPlaying, handleManualStep, playbackSpeed]);

  return { handleManualStep };
}
