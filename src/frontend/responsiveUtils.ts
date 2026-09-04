/**
 * Responsive design utilities and breakpoint constants for the frontend.
 */

export const MOBILE_BREAKPOINT = 768;

/**
 * Checks whether the current viewport or container width falls below the mobile breakpoint.
 *
 * @param width - Current width in pixels (e.g. window.innerWidth or container width)
 * @param breakpoint - Threshold breakpoint in pixels (defaults to 768)
 * @returns true if width is less than breakpoint, otherwise false
 */
export function isMobileViewport(width: number, breakpoint: number = MOBILE_BREAKPOINT): boolean {
  return width < breakpoint;
}

/**
 * Calculates the optimal terminal font size based on the container width.
 * - < 480px: 12px (compact handheld / phone screens)
 * - 480px - 767px: 13px (tablet / compact screens)
 * - >= 768px: 15px (desktop / large screens)
 *
 * @param containerWidth - Width of the terminal container in pixels
 * @returns Terminal font size in pixels
 */
export function getTerminalFontSize(containerWidth: number): number {
  if (containerWidth < 480) {
    return 12;
  } else if (containerWidth < 768) {
    return 13;
  } else {
    return 15;
  }
}
