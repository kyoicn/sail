import { describe, it, expect } from 'vitest';
import { toSliderValue, fromSliderValue, formatChronosTime } from '../time-engine';

describe('Time Engine Logic', () => {
  
  describe('toSliderValue (Year -> Slider)', () => {
    it('handles AD years correctly (shifts by -1)', () => {
      // 1 AD should be slider value 0
      expect(toSliderValue(1)).toBe(0);
      expect(toSliderValue(2024)).toBe(2023);
    });

    it('handles BC years correctly (no shift)', () => {
      // -1 (1 BC) should be slider value -1
      expect(toSliderValue(-1)).toBe(-1);
      expect(toSliderValue(-500)).toBe(-500);
    });
  });

  describe('fromSliderValue (Slider -> Year)', () => {
    it('converts 0 to 1 AD', () => {
      expect(fromSliderValue(0)).toEqual({ year: 1, era: 'AD' });
    });

    it('converts -1 to 1 BC', () => {
      expect(fromSliderValue(-1)).toEqual({ year: 1, era: 'BC' });
    });

    it('round-trips correctly', () => {
      const yearAD = 1990;
      const slider = toSliderValue(yearAD);
      const result = fromSliderValue(slider);
      expect(result.year).toBe(yearAD);
      expect(result.era).toBe('AD');
    });
  });

  describe('formatChronosTime', () => {
    it('formats AD years', () => {
      expect(formatChronosTime({ year: 2000, precision: 'year' })).toBe('2000 AD');
    });

    it('formats BC years', () => {
      expect(formatChronosTime({ year: -500, precision: 'year' })).toBe('500 BC');
    });

    it('formats precise dates', () => {
      expect(formatChronosTime({ 
        year: 1945, 
        month: 8, 
        day: 15, 
        precision: 'day' 
      })).toBe('Aug 15, 1945 AD');
    });
  });
});