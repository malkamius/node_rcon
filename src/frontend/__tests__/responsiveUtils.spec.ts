import {
  isMobileViewport,
  getTerminalFontSize,
  MOBILE_BREAKPOINT,
} from '../responsiveUtils';

describe('responsiveUtils', () => {
  describe('MOBILE_BREAKPOINT', () => {
    it('has default value of 768', () => {
      expect(MOBILE_BREAKPOINT).toBe(768);
    });
  });

  describe('isMobileViewport', () => {
    it('returns true when width is below default mobile breakpoint (768)', () => {
      expect(isMobileViewport(320)).toBe(true);
      expect(isMobileViewport(480)).toBe(true);
      expect(isMobileViewport(767)).toBe(true);
    });

    it('returns false when width is equal to or greater than default mobile breakpoint (768)', () => {
      expect(isMobileViewport(768)).toBe(false);
      expect(isMobileViewport(1024)).toBe(false);
      expect(isMobileViewport(1920)).toBe(false);
    });

    it('supports custom breakpoint parameter', () => {
      expect(isMobileViewport(500, 600)).toBe(true);
      expect(isMobileViewport(600, 600)).toBe(false);
      expect(isMobileViewport(800, 600)).toBe(false);
    });
  });

  describe('getTerminalFontSize', () => {
    it('returns 12 for compact mobile viewports (< 480px)', () => {
      expect(getTerminalFontSize(0)).toBe(12);
      expect(getTerminalFontSize(320)).toBe(12);
      expect(getTerminalFontSize(479)).toBe(12);
    });

    it('returns 13 for tablet / mid-size viewports (480px <= width < 768px)', () => {
      expect(getTerminalFontSize(480)).toBe(13);
      expect(getTerminalFontSize(600)).toBe(13);
      expect(getTerminalFontSize(767)).toBe(13);
    });

    it('returns 15 for desktop / large viewports (>= 768px)', () => {
      expect(getTerminalFontSize(768)).toBe(15);
      expect(getTerminalFontSize(1024)).toBe(15);
      expect(getTerminalFontSize(1920)).toBe(15);
    });
  });
});
