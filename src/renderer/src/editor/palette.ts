export type PalettePreset = {
  id: string;
  name: string;
  colors: string[];
};

export const DEFAULT_PALETTES: PalettePreset[] = [
  {
    id: "warm",
    name: "Warm",
    colors: [
      "#ff6b4a",
      "#ffb454",
      "#f4d35e",
      "#8bd3dd",
      "#4f9dff",
      "#a78bfa",
      "#f472b6",
      "#17191f",
    ],
  },
];

export function parsePalettePresets(value: string | null) {
  if (!value) return DEFAULT_PALETTES;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return DEFAULT_PALETTES;
    const presets = parsed
      .slice(0, 32)
      .filter(
        (preset): preset is PalettePreset =>
          Boolean(preset) &&
          typeof preset === "object" &&
          typeof (preset as PalettePreset).id === "string" &&
          (preset as PalettePreset).id.length > 0 &&
          (preset as PalettePreset).id.length <= 80 &&
          typeof (preset as PalettePreset).name === "string" &&
          (preset as PalettePreset).name.trim().length > 0 &&
          (preset as PalettePreset).name.length <= 40 &&
          Array.isArray((preset as PalettePreset).colors) &&
          (preset as PalettePreset).colors.length > 0 &&
          (preset as PalettePreset).colors.length <= 16 &&
          (preset as PalettePreset).colors.every(
            (color) =>
              typeof color === "string" && /^#[\da-f]{6}$/i.test(color),
          ),
      );
    return presets.length ? presets : DEFAULT_PALETTES;
  } catch {
    return DEFAULT_PALETTES;
  }
}
