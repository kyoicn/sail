import { ChronosTime, EventData } from '../types';

/**
 * lib/time-engine.ts
 * Chronological Logic Engine
 * ------------------------------------------------------------------
 * Handles the complexity of historical time calculations, specifically:
 * 1. The "No Year Zero" problem (1 BC to 1 AD).
 * 2. Converting between logical years and UI slider values.
 * 3. Formatting date strings based on precision.
 */

/**
 * Returns the short English name for a month index.
 * @param month 1-based index (1 = Jan, 12 = Dec)
 */
export const getMonthName = (month: number): string => 
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] || "";

/**
 * Converts a historical year to a continuous slider value.
 * Logic: Historical years skip 0 (1 BC -> 1 AD). 
 * To make a continuous slider, we shift positive years down by 1.
 * e.g., 1 AD -> 0, 2 AD -> 1, -1 (1 BC) -> -1.
 */
export const toSliderValue = (year: number): number => 
  year > 0 ? year - 1 : year;

/**
 * Converts a continuous slider value back to a historical year structure.
 * Logic: Reverses the shift applied in toSliderValue.
 */
export const fromSliderValue = (value: number): { year: number; era: 'AD' | 'BC' } => {
  const floored = Math.floor(value);
  // If value >= 0, it represents AD (0 -> 1 AD).
  // If value < 0, it represents BC (-1 -> 1 BC).
  return floored >= 0 
    ? { year: floored + 1, era: 'AD' } 
    : { year: Math.abs(floored), era: 'BC' };
};

/**
 * Formats a ChronosTime object into a readable string string based on its precision.
 * e.g., "2500 BC" or "Oct 12, 1492 AD"
 */
export const formatChronosTime = (time: ChronosTime): string => {
  const era = time.year < 0 ? 'BC' : 'AD';
  const absYear = Math.abs(time.year);

  if (time.precision === 'day' && time.month && time.day) {
      return `${getMonthName(time.month)} ${time.day}, ${absYear} ${era}`;
  }
  if (time.precision === 'month' && time.month) {
      return `${getMonthName(time.month)} ${absYear} ${era}`;
  }
  return `${absYear} ${era}`;
};

/**
 * Formats a simple number value for the Slider tick labels.
 */
export const formatSliderTick = (value: number): string => {
  const { year, era } = fromSliderValue(value);
  return `${year} ${era}`;
};

/**
 * Generates the full date range string for an event card.
 * Handles single point events vs. duration events.
 */
export const formatEventDateRange = (event: EventData): string => {
  if (event.end) {
      return `${formatChronosTime(event.start)} – ${formatChronosTime(event.end)}`;
  }
  return formatChronosTime(event.start);
};

/**
 * Formats the large "Current Date" display in the TimeControl.
 * Adapts based on the current zoom span (showing more detail if zoomed in).
 */
export const formatNaturalDate = (sliderValue: number, sliderSpan: number): string => {
  const { year, era } = fromSliderValue(sliderValue);
  // Future logic: If sliderSpan < 5 (zoomed in very close), show months/days if available.
  // For now, consistent year display is sufficient for MVP.
  return `${year} ${era}`;
};