import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

/**
 * The arrow keys move a picked-up card a whole column at a time: left and
 * right when the columns sit side by side, up and down when a narrow screen
 * stacks them. It returns where the card's top-left corner goes: centered
 * near the top of the nearest column that lies that way.
 */
export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { collisionRect, droppableRects, droppableContainers } }
) => {
  const direction = DIRECTIONS[event.code];
  if (!direction || !collisionRect) return undefined;
  event.preventDefault();
  const from = {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  let best: { left: number; top: number; distance: number } | undefined;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const left = rect.left + (rect.width - collisionRect.width) / 2;
    const top = rect.top + Math.min(16, rect.height / 4);
    const dx = left + collisionRect.width / 2 - from.x;
    const dy = top + collisionRect.height / 2 - from.y;
    // Only columns ahead in the arrow's direction count.
    if (dx * direction[0] + dy * direction[1] <= 1) continue;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { left, top, distance };
  }
  return best && { x: best.left, y: best.top };
};
