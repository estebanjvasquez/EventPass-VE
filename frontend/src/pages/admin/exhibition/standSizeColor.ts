const palette = ["#93c5fd", "#fde68a", "#86efac", "#c4b5fd", "#f9a8d4", "#67e8f9", "#fdba74", "#a5b4fc", "#bef264", "#fca5a5"];

export function standSizeColor(width: number, height: number) {
  const dimensions = [width, height].sort((a, b) => a - b);
  const first = Math.round(dimensions[0] * 100);
  const second = Math.round(dimensions[1] * 100);
  return palette[Math.abs((first * 31 + second * 17) % palette.length)];
}
