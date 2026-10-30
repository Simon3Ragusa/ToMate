// The ToMate logo: a line-drawn tomato with a small face, on an optional
// tile. Built as an SVG string so the same drawing serves the UI, the
// settings preview, the window/taskbar icon and the installer icon.

export type Shape = "rounded" | "circle" | "none";
export type Weight = "thin" | "regular" | "bold";

export interface LogoStyle {
  line: string; // #rrggbb
  tile: string; // #rrggbb
  shape: Shape;
  face: boolean;
  weight: Weight;
}

export const DEFAULT_LOGO: LogoStyle = { line: "#ffffff", tile: "#17213b", shape: "rounded", face: true, weight: "regular" };

export const LOGO_PRESETS: { name: string; style: Omit<LogoStyle, "face" | "weight"> }[] = [
  { name: "Night", style: { line: "#ffffff", tile: "#17213b", shape: "rounded" } },
  { name: "Paper", style: { line: "#17213b", tile: "#fff4ec", shape: "rounded" } },
  { name: "Tomato", style: { line: "#ffffff", tile: "#e8453c", shape: "rounded" } },
  { name: "Leaf", style: { line: "#ffffff", tile: "#2f8a41", shape: "rounded" } },
  { name: "Ink", style: { line: "#17213b", tile: "#ffffff", shape: "circle" } },
];

const HEX = /^#[0-9a-f]{6}$/i;
const WEIGHTS: Record<Weight, number> = { thin: 0.75, regular: 1, bold: 1.35 };

/** Keep only well-formed values (the style comes from storage). */
export function cleanStyle(s: Partial<LogoStyle> | null | undefined): LogoStyle {
  const d = DEFAULT_LOGO;
  return {
    line: HEX.test(s?.line ?? "") ? s!.line! : d.line,
    tile: HEX.test(s?.tile ?? "") ? s!.tile! : d.tile,
    shape: s?.shape === "circle" || s?.shape === "none" || s?.shape === "rounded" ? s.shape : d.shape,
    face: typeof s?.face === "boolean" ? s.face : d.face,
    weight: s?.weight === "thin" || s?.weight === "bold" || s?.weight === "regular" ? s.weight : d.weight,
  };
}

/**
 * SVG markup of the logo. `size` is the pixel size it will be shown at:
 * at 32 px and below the drawing gets thicker lines and fewer leaves, so it
 * stays a tomato instead of a smudge.
 */
export function logoSvg(style: LogoStyle, size = 128): string {
  const s = cleanStyle(style);
  const small = size <= 32;
  const k = WEIGHTS[s.weight] * (small ? 1.7 : 1);
  const w = (n: number) => (n * k).toFixed(2);
  const c = s.line;
  // Without a tile the tomato fills more of the square.
  const scale = s.shape === "none" ? 1.45 : 1.2;

  const tile =
    s.shape === "rounded"
      ? `<rect width="160" height="160" rx="36" fill="${s.tile}"/>`
      : s.shape === "circle"
        ? `<circle cx="80" cy="80" r="80" fill="${s.tile}"/>`
        : "";

  const leaves = small
    ? `<path d="M-1,-27 C-11,-29 -22,-25 -30,-15 C-21,-19 -12,-22 -1,-23" stroke-width="${w(3)}"/>
       <path d="M1,-27 C11,-29 22,-25 30,-15 C21,-19 12,-22 1,-23" stroke-width="${w(3)}"/>`
    : `<path d="M-11,-20 C-15,-17 -17,-13 -18,-9" stroke-width="${w(3)}"/>
       <path d="M11,-20 C15,-17 17,-13 18,-9" stroke-width="${w(3)}"/>
       <path d="M-1,-27 C-11,-29 -22,-25 -30,-15 C-21,-19 -12,-22 -1,-23" stroke-width="${w(3)}"/>
       <path d="M1,-27 C11,-29 22,-25 30,-15 C21,-19 12,-22 1,-23" stroke-width="${w(3)}"/>
       <path d="M-1,-28 C-6,-35 -15,-39 -23,-38 C-16,-35 -9,-31 -3,-26" stroke-width="${w(3)}"/>
       <path d="M1,-28 C6,-35 15,-39 23,-38 C16,-35 9,-31 3,-26" stroke-width="${w(3)}"/>`;

  const face = s.face
    ? `<path d="M-8,21 Q0,28 8,21" stroke-width="${w(3.6)}"/>
       <circle cx="-12" cy="6" r="${small ? 4.4 : 3.7}" fill="${c}" stroke="none"/>
       <circle cx="12" cy="6" r="${small ? 4.4 : 3.7}" fill="${c}" stroke="none"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="${size}" height="${size}">${tile}<g transform="translate(80 84) scale(${scale})" fill="none" stroke="${c}" stroke-linecap="round" stroke-linejoin="round"><path d="M0,-24 C9,-33 31,-33 43,-23 C55,-12 57,11 47,27 C37,41 19,45 0,45 C-19,45 -37,41 -47,27 C-57,11 -55,-12 -43,-23 C-31,-33 -9,-33 0,-24 Z" stroke-width="${w(4)}"/>${leaves}<path d="M0,-30 C1,-38 3,-42 8,-44" stroke-width="${w(4.5)}"/>${face}</g></svg>`;
}

/** Rasterise the logo (e.g. for the window icon). Returns RGBA pixels. */
export async function logoPixels(style: LogoStyle, size: number): Promise<Uint8Array> {
  const img = new Image(size, size);
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(logoSvg(style, size));
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  return new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer);
}
