import { ChronosTime, EventData } from '../types';

/**
 * lib/time-engine.ts
 * Chronological Logic Engine (High Precision Upgrade)
 * ------------------------------------------------------------------
 * Handles the complexity of historical time calculations.
 * V3 Upgrade: Precise Gregorian Calendar Logic (No more averages).
 */

const HOURS_IN_DAY = 24;
const MIN_IN_HOUR = 60;
const SEC_IN_MIN = 60;
const MS_IN_SEC = 1000;

/**
 * Returns true if the year is a leap year (Gregorian).
 * Uses Astronomical Year Numbering (0 = 1 BC, -1 = 2 BC).
 * 0 is a leap year (divisible by 400).
 */
export const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

export const getDaysInMonth = (year: number, month: number): number => {
  // Month is 1-based (1=Jan)
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return days[month];
};

export const getDaysInYear = (year: number): number => {
  return isLeapYear(year) ? 366 : 365;
};

/**
 * Returns the short English name for a month index.
 * @param month 1-based index (1 = Jan, 12 = Dec)
 */
export const getMonthName = (month: number): string =>
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] || "";

/**
 * Converts a historical year to a continuous slider value.
 * Logic: Historical years skip 0 (1 BC -> 1 AD). 
 * e.g., 1 AD -> 0, 2 AD -> 1, -1 (1 BC) -> -1.
 */
export const toSliderValue = (year: number): number =>
  year > 0 ? year - 1 : year; // Shift positive years to make 0 continuous with -1

/**
 * Converts a continuous slider value back to a structured time object.
 * Now supports breakdown into Months, Days, Hours, Minutes, Seconds, MS.
 */
export const fromSliderValue = (value: number): { year: number; era: 'AD' | 'BC'; details?: { month: number; day: number; hour: number; minute: number; second: number; millisecond: number } } => {
  const floorVal = Math.floor(value);
  const fraction = Math.abs(value - floorVal);

  // 1. Calculate Year
  let year = floorVal >= 0 ? floorVal + 1 : Math.abs(floorVal);
  const era = floorVal >= 0 ? 'AD' : 'BC';

  // 2. Adjust Year for Astronomical Calculation (Back to 0-based for leap year check)
  // if AD: year=1 -> astro=1. if BC: year=1 (1BC) -> astro=0.
  const astroYear = floorVal >= 0 ? year : -(year - 1);

  // 3. Calculate Sub-Year Details (Precise Walk)
  const daysInCurrentYear = getDaysInYear(astroYear);
  const EPSILON = 1e-9; // Handle float underflow (e.g. 59.999... -> 60)
  let totalDays = (fraction * daysInCurrentYear) + EPSILON;

  // Walk months
  let month = 1;
  while (month <= 12) {
    const dim = getDaysInMonth(astroYear, month);
    if (totalDays < dim) break;
    totalDays -= dim;
    month++;
  }
  // Clamp month (shouldn't happen mathematically unless totalDays = 365/366 EXACTLY)
  if (month > 12) month = 12;

  const day = Math.floor(totalDays) + 1; // 1-based day

  // Time Details
  let remainderHours = (totalDays % 1) * HOURS_IN_DAY;
  const hour = Math.floor(remainderHours);

  let remainderMinutes = (remainderHours % 1) * MIN_IN_HOUR;
  const minute = Math.floor(remainderMinutes);

  let remainderSeconds = (remainderMinutes % 1) * SEC_IN_MIN;
  const second = Math.floor(remainderSeconds);

  let remainderMs = (remainderSeconds % 1) * MS_IN_SEC;
  const millisecond = Math.floor(remainderMs);

  return {
    year,
    era,
    details: { month, day, hour, minute, second, millisecond }
  };
};

/**
 * Utility: Converts a precise date to an astronomical float year.
 * Useful for defining events in constants.ts.
 * 
 * @param time Struct with year, month, day, etc.
 * @returns Float value (astro year)
 */
export const getAstroYear = (time: { year: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; millisecond?: number }): number => {
  const y = time.year;
  const daysInYear = getDaysInYear(y);

  let dayOfYear = 0;
  const m = time.month || 1;
  for (let i = 1; i < m; i++) {
    dayOfYear += getDaysInMonth(y, i);
  }
  dayOfYear += (time.day || 1) - 1; // 0-based index for calculation

  const hourFrac = (time.hour || 0) / HOURS_IN_DAY;
  const minFrac = (time.minute || 0) / (HOURS_IN_DAY * MIN_IN_HOUR);
  const secFrac = (time.second || 0) / (HOURS_IN_DAY * MIN_IN_HOUR * SEC_IN_MIN);
  const msFrac = (time.millisecond || 0) / (HOURS_IN_DAY * MIN_IN_HOUR * SEC_IN_MIN * MS_IN_SEC);

  const fraction = (dayOfYear + hourFrac + minFrac + secFrac + msFrac) / daysInYear;

  return y + fraction; // Note: For BC years this maps simply to negative float space?
  // Wait, consistency check:
  // If year is -1 (1 BC): Slider value is -1.
  // getAstroYear(-1) -> -1.something.
  // Consistent.
};

/**
 * Formats a ChronosTime object into a readable string based on its precision.
 */
export const formatChronosTime = (time: ChronosTime): string => {
  const era = time.year < 0 ? 'BC' : 'AD';
  const absYear = Math.abs(time.year);

  // High Precision formatting
  if (['hour', 'minute', 'second', 'millisecond'].includes(time.precision)) {
    const h = (time.hour || 0).toString().padStart(2, '0');
    const m = (time.minute || 0).toString().padStart(2, '0');
    const s = (time.second || 0).toString().padStart(2, '0');
    const ms = (time.millisecond || 0).toString().padStart(3, '0');

    let timeStr = `${h}:${m}`;
    if (['second', 'millisecond'].includes(time.precision)) timeStr += `:${s}`;
    if (time.precision === 'millisecond') timeStr += `.${ms}`;

    return `${getMonthName(time.month || 1)} ${time.day || 1}, ${absYear} ${era} at ${timeStr}`;
  }

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
export const formatSliderTick = (value: number, span: number = 100): string => {
  const { year, era, details } = fromSliderValue(value);

  // Smart Ticks: If zoom is very deep, show details
  if (span < 0.0001) { // < 1 Hour span
    return `${details!.minute}:${details!.second}.${details!.millisecond}`;
  }
  if (span < 0.01) { // < 4 Days span
    return `${details!.hour}:${details!.minute}:${details!.second}`;
  }
  if (span < 1) { // < 1 Year
    return `${getMonthName(details!.month)} ${details!.day}`;
  }

  return `${year} ${era}`;
};

/**
 * Generates the full date range string for an event card.
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
  const { year, era, details } = fromSliderValue(sliderValue);
  const d = details!;

  // Thresholds for precision display
  // 1 Year ≈ 1.0
  // 1 Month ≈ 0.08
  // 1 Day ≈ 0.0027
  // 1 Minute ≈ 0.000002

  if (sliderSpan < 0.000005) { // Millisecond Level
    return `${d.hour}:${d.minute}:${d.second}.${d.millisecond}`;
  }
  if (sliderSpan < 0.002) { // Minute/Second Level
    return `${getMonthName(d.month)} ${d.day}, ${year} ${era} - ${d.hour}:${d.minute}:${d.second}`;
  }
  if (sliderSpan < 1.5) { // Day Level
    return `${getMonthName(d.month)} ${d.day}, ${year} ${era}`;
  }

  return `${year} ${era}`;
};

/**
 * Zoom Scale Constants (Span in Years)
 */
export const ZOOM_SCALES = {
  MILLENNIUM: 1000,
  CENTURY: 100,
  DECADE: 10,
  YEAR: 1,
  MONTH: 1 / 12,      // ~0.0833
  DAY: 1 / 365.25     // ~0.0027
};

/**
 * Determining the current zoom scale name based on the viewport span.
 * Returns the key of the closest scale (e.g. 'YEAR', 'CENTURY') or 'ALL'/'CUSTOM'
 */
export const getClosestScale = (span: number, globalSpan: number): string => {
  // 1. Check if "All" (approximate match to global span)
  if (Math.abs(span - globalSpan) < 1) return 'ALL';

  // 2. Find closest standard scale
  const scales = Object.entries(ZOOM_SCALES);
  let closest = 'CUSTOM';
  let minDiff = Infinity;

  for (const [key, val] of scales) {
    // Logarithmic distance is better for scale comparison
    const diff = Math.abs(Math.log(span) - Math.log(val));
    if (diff < minDiff) {
      minDiff = diff;
      closest = key;
    }
  }

  // Always return the closest scale, regardless of exact match
  return closest;
};