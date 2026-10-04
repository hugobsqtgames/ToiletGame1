import { textWidth } from './text3d';

/** Side margin (m) kept between a gate label and its panel edges. */
const MARGIN = 0.2;

/**
 * Scale (≤ 1) that makes a label of cap height `height` fit a panel `panelWidth`
 * meters wide. Large late-game values ("+12500", "<1200 /-360") would otherwise
 * spill over the neighbouring gates.
 */
export function gateLabelScale(text: string, panelWidth: number, height: number): number {
  const w = textWidth(text) * height;
  const room = Math.max(0.1, panelWidth - MARGIN);
  return w > room ? room / w : 1;
}
