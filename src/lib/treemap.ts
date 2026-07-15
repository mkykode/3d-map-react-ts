export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk). Values must be positive;
 * returns one rect per value, in input order, tiling `width` x `height`.
 */
export function squarify(
  values: number[],
  width: number,
  height: number,
): TreemapRect[] {
  const total = values.reduce((a, b) => a + b, 0);
  const rects: TreemapRect[] = new Array(values.length);
  if (total <= 0 || values.length === 0) return [];

  const scale = (width * height) / total;
  const items = values.map((v, i) => ({ area: v * scale, i }));

  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: { area: number; i: number }[] = [];
  let rowArea = 0;

  const worst = (areas: { area: number }[], side: number): number => {
    const sum = areas.reduce((a, b) => a + b.area, 0);
    let max = 0;
    let min = Infinity;
    for (const { area } of areas) {
      if (area > max) max = area;
      if (area < min) min = area;
    }
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const layoutRow = () => {
    const side = Math.min(w, h);
    const thickness = rowArea / side;
    let offset = 0;
    for (const { area, i } of row) {
      const length = area / thickness;
      if (w <= h) {
        rects[i] = { x: x + offset, y, w: length, h: thickness };
      } else {
        rects[i] = { x, y: y + offset, w: thickness, h: length };
      }
      offset += length;
    }
    if (w <= h) {
      y += thickness;
      h -= thickness;
    } else {
      x += thickness;
      w -= thickness;
    }
    row = [];
    rowArea = 0;
  };

  for (const item of items) {
    const side = Math.min(w, h);
    if (
      row.length > 0 &&
      worst([...row, item], side) > worst(row, side)
    ) {
      layoutRow();
    }
    row.push(item);
    rowArea += item.area;
  }
  if (row.length > 0) layoutRow();
  return rects;
}
