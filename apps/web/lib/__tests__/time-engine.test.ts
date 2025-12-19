import { describe, it, expect } from 'vitest';
import {
  toSliderValue,
  fromSliderValue,
  formatChronosTime,
  isLeapYear,
  getDaysInMonth,
  getDaysInYear,
  getAstroYear
} from '../time-engine';

describe('Time Engine V3 (Precise Calendar)', () => {

  describe('Calendar Utilities', () => {
    it('identifies leap years correctly (Gregorian & Astronomical)', () => {
      expect(isLeapYear(2024)).toBe(true);  // Div by 4
      expect(isLeapYear(2023)).toBe(false); // Common
      expect(isLeapYear(2000)).toBe(true);  // Div by 400
      expect(isLeapYear(1900)).toBe(false); // Div by 100 but not 400
      expect(isLeapYear(0)).toBe(true);     // 1 BC (Astronomical 0) is leap
      expect(isLeapYear(-1)).toBe(false);   // 2 BC (Astronomical -1) is common
      expect(isLeapYear(-4)).toBe(true);    // 5 BC (Astronomical -4) is leap
    });

    it('returns correct days in month', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29); // Feb Leap
      expect(getDaysInMonth(2023, 2)).toBe(28); // Feb Common
      expect(getDaysInMonth(2024, 1)).toBe(31); // Jan
    });

    it('returns correct days in year', () => {
      expect(getDaysInYear(2024)).toBe(366);
      expect(getDaysInYear(2023)).toBe(365);
    });
  });

  describe('toSliderValue (Year -> Slider)', () => {
    it('handles AD years correctly', () => {
      expect(toSliderValue(1)).toBe(0);
      expect(toSliderValue(2024)).toBe(2023);
    });

    it('handles BC years correctly', () => {
      expect(toSliderValue(-1)).toBe(-1);
      expect(toSliderValue(-500)).toBe(-500);
    });

    it('handles fractional years', () => {
      expect(toSliderValue(2024.5)).toBe(2023.5);
    });
  });

  describe('getAstroYear (Date -> Float)', () => {
    it('converts start of year correctly', () => {
      const astro = getAstroYear({ year: 2024, month: 1, day: 1 });
      expect(astro).toBe(2024);
    });

    it('converts mid-year correctly (Leap vs Common)', () => {
      // July 1st
      // 2024 (Leap): Days before July 1 = 31+29+31+30+31+30 = 182.
      // Fraction = 182 / 366 ≈ 0.4972677
      const leapAstro = getAstroYear({ year: 2024, month: 7, day: 1 });
      expect(leapAstro).toBeCloseTo(2024 + (182 / 366), 6);

      // 2023 (Common): Days before July 1 = 31+28+31+30+31+30 = 181.
      // Fraction = 181 / 365 ≈ 0.49589
      const commonAstro = getAstroYear({ year: 2023, month: 7, day: 1 });
      expect(commonAstro).toBeCloseTo(2023 + (181 / 365), 6);
    });

    it('handles precise time (hours/mins)', () => {
      // Jan 1 2024 at 12:00 PM (half day passed)
      // Fraction = 0.5 / 366
      const astro = getAstroYear({ year: 2024, month: 1, day: 1, hour: 12 });
      expect(astro).toBeCloseTo(2024 + (0.5 / 366), 8);
    });
  });

  describe('fromSliderValue (Slider -> Date)', () => {
    it('recovers Precise Date (Leap Year Feb 29)', () => {
      // Feb 29 is Day 60 (index 59). Fraction = 59/366.
      const sliderVal = toSliderValue(2024 + (59 / 366));
      const res = fromSliderValue(sliderVal);

      expect(res.year).toBe(2024);
      expect(res.details?.month).toBe(2);
      expect(res.details?.day).toBe(29);
    });

    it('recovers Precise Date (Common Year Feb 28)', () => {
      // Feb 28 is Day 59 (index 58). Fraction = 58/365.
      const sliderVal = toSliderValue(2023 + (58 / 365));
      const res = fromSliderValue(sliderVal);

      expect(res.year).toBe(2023);
      expect(res.details?.month).toBe(2);
      expect(res.details?.day).toBe(28);
    });

    it('recovers Sub-Day Precision', () => {
      // Jan 1 2024 at 12:30:30.500
      const totalSecsInYear = 366 * 24 * 3600;
      const targetSecs = 12 * 3600 + 30 * 60 + 30.5;
      const fraction = targetSecs / totalSecsInYear;

      const sliderVal = toSliderValue(2024 + fraction); // Day 1 is index 0
      const res = fromSliderValue(sliderVal);

      expect(res.details?.hour).toBe(12);
      expect(res.details?.minute).toBe(30);
      expect(res.details?.second).toBe(30);
      expect(res.details?.millisecond).toBe(500);
    });
  });

  describe('formatChronosTime', () => {
    it('formats millisecond precision', () => {
      const time = {
        year: 2024, month: 1, day: 1,
        hour: 12, minute: 0, second: 0, millisecond: 123,
        astro_year: 2024,
        precision: 'millisecond' as const
      };
      expect(formatChronosTime(time)).toBe('Jan 1, 2024 AD at 12:00:00.123');
    });
  });
});