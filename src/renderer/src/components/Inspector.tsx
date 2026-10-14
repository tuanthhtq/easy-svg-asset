import { useEffect, useRef, useState } from "react";
import type { FabricObject } from "fabric";
import {
  Check,
  Palette,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { PalettePreset } from "../editor/palette";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";

type InspectorProps = {
  selected: FabricObject | null;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  radius: number;
  onStrokeWidthChange: (value: number) => void;
  onRadiusChange: (value: number) => void;
  onPositionChange: (key: "left" | "top", value: number) => void;
  onSizeChange: (key: "width" | "height", value: number) => void;
  onPaletteColor: (value: string | null, target: "fill" | "stroke") => void;
  palettes: PalettePreset[];
  paletteId: string;
  onPaletteIdChange: (id: string) => void;
  onPalettesChange: (palettes: PalettePreset[]) => void;
};

export function Inspector({
  selected,
  fill,
  stroke,
  strokeWidth,
  radius,
  onStrokeWidthChange,
  onRadiusChange,
  onPositionChange,
  onSizeChange,
  onPaletteColor,
  palettes,
  paletteId,
  onPaletteIdChange,
  onPalettesChange,
}: InspectorProps) {
  const [paletteTarget, setPaletteTarget] = useState<"fill" | "stroke">("fill");
  const [editingPalette, setEditingPalette] = useState(false);
  const [presetEditor, setPresetEditor] = useState<{
    mode: "add" | "rename";
    name: string;
  } | null>(null);
  const [selectedPaletteColor, setSelectedPaletteColor] = useState<
    number | null
  >(null);
  const [paletteMenu, setPaletteMenu] = useState<{
    x: number;
    y: number;
    index: number;
  } | null>(null);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(
    null,
  );
  const colorInputRef = useRef<HTMLInputElement>(null);
  const palette = palettes.find((item) => item.id === paletteId) ?? palettes[0];
  const currentFill = selected ? selected.fill : fill;
  const currentStroke = selected ? selected.stroke : stroke;
  const fillColor = typeof currentFill === "string" ? currentFill : null;
  const strokeColor = typeof currentStroke === "string" ? currentStroke : null;

  useEffect(() => {
    if (!paletteMenu) return;
    const close = () => setPaletteMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [paletteMenu]);

  function savePresetName() {
    if (!presetEditor) return;
    const name = presetEditor.name.trim().slice(0, 40);
    if (!name) return;
    if (presetEditor.mode === "rename") {
      onPalettesChange(
        palettes.map((item) =>
          item.id === palette.id ? { ...item, name } : item,
        ),
      );
      setPresetEditor(null);
      return;
    }
    const next: PalettePreset = {
      id: crypto.randomUUID(),
      name,
      colors: [...palette.colors],
    };
    onPalettesChange([...palettes, next]);
    onPaletteIdChange(next.id);
    setPresetEditor(null);
  }

  function removePalette() {
    if (
      palettes.length === 1 ||
      !window.confirm(`Delete palette "${palette.name}"?`)
    )
      return;
    const remaining = palettes.filter((item) => item.id !== palette.id);
    onPalettesChange(remaining);
    onPaletteIdChange(remaining[0].id);
  }

  function updatePaletteColor(index: number, color: string) {
    onPalettesChange(
      palettes.map((item) =>
        item.id === palette.id
          ? {
              ...item,
              colors: item.colors.map((value, itemIndex) =>
                itemIndex === index ? color : value,
              ),
            }
          : item,
      ),
    );
  }

  function addPaletteColor(color: string) {
    if (palette.colors.length >= 16) return;
    onPalettesChange(
      palettes.map((item) =>
        item.id === palette.id
          ? { ...item, colors: [...item.colors, color] }
          : item,
      ),
    );
  }

  function removePaletteColor(index: number) {
    if (palette.colors.length === 1) return;
    onPalettesChange(
      palettes.map((item) =>
        item.id === palette.id
          ? {
              ...item,
              colors: item.colors.filter((_, itemIndex) => itemIndex !== index),
            }
          : item,
      ),
    );
    setSelectedPaletteColor(null);
  }

  function choosePaletteColor(index: number, color: string) {
    if (editingPalette) {
      setSelectedPaletteColor(index);
      return;
    }
    onPaletteColor(color, paletteTarget);
  }

  function openPaletteColorEditor(index: number) {
    setPaletteMenu(null);
    setEditingColorIndex(index);
    const input = colorInputRef.current;
    if (!input) return;
    input.value = palette.colors[index];
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }

  return (
    <aside className="inspector">
      <div className="palette-setting">
        <div className="palette-toolbar">
          <select
            aria-label="Palette preset"
            value={palette.id}
            onChange={(event) => onPaletteIdChange(event.target.value)}
          >
            {palettes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <AppButton
            title="New palette"
            aria-label="New palette"
            onClick={() =>
              setPresetEditor({ mode: "add", name: "New palette" })
            }
          >
            <Plus />
          </AppButton>
          <AppButton
            title="Rename palette"
            aria-label="Rename palette"
            onClick={() =>
              setPresetEditor({ mode: "rename", name: palette.name })
            }
          >
            <Pencil />
          </AppButton>
          <AppButton
            className={editingPalette ? "active" : ""}
            title="Edit palette colors"
            aria-label="Edit palette colors"
            onClick={() => {
              setEditingPalette((value) => !value);
              setPaletteMenu(null);
              setSelectedPaletteColor(null);
            }}
          >
            {editingPalette ? <Check /> : <Palette />}
          </AppButton>
          <AppButton
            title="Delete palette"
            aria-label="Delete palette"
            disabled={palettes.length === 1}
            onClick={removePalette}
          >
            <Trash2 />
          </AppButton>
        </div>
        {presetEditor && (
          <div className="palette-name-editor">
            <input
              autoFocus
              maxLength={40}
              value={presetEditor.name}
              onChange={(event) =>
                setPresetEditor({ ...presetEditor, name: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") savePresetName();
                if (event.key === "Escape") setPresetEditor(null);
              }}
            />
            <AppButton onClick={savePresetName}>Save</AppButton>
            <AppButton onClick={() => setPresetEditor(null)}>Cancel</AppButton>
          </div>
        )}
        <div className="palette-swatches" aria-label="Palette presets">
          <AppButton
            className="palette-swatch palette-none"
            title={`No ${paletteTarget}`}
            aria-label={`No ${paletteTarget}`}
            onClick={() => onPaletteColor(null, paletteTarget)}
          />
          {palette.colors.map((color, index) => (
            <div
              className={
                selectedPaletteColor === index
                  ? "palette-swatch-wrap selected"
                  : "palette-swatch-wrap"
              }
              key={`${index}-${color}`}
              onMouseDown={(event) => {
                if (!editingPalette || event.button !== 1) return;
                event.preventDefault();
                removePaletteColor(index);
              }}
              onContextMenu={(event) => {
                if (!editingPalette) return;
                event.preventDefault();
                setPaletteMenu({
                  x: Math.min(event.clientX, window.innerWidth - 140),
                  y: Math.min(event.clientY, window.innerHeight - 90),
                  index,
                });
              }}
            >
              <AppButton
                className="palette-swatch"
                title={color}
                aria-label={`Use ${color}`}
                style={{ backgroundColor: color }}
                onClick={() => choosePaletteColor(index, color)}
              />
            </div>
          ))}
          {editingPalette && (
            <label
              className="palette-add-color"
              title="Add color"
              aria-label="Add color"
            >
              <Plus />
              <input
                type="color"
                value="#ffffff"
                disabled={palette.colors.length >= 16}
                onChange={(event) => addPaletteColor(event.target.value)}
              />
            </label>
          )}
        </div>
        {editingPalette && selectedPaletteColor !== null && (
          <label className="palette-selected-color">
            <span>Edit color</span>
            <input
              type="color"
              value={palette.colors[selectedPaletteColor] ?? "#000000"}
              onChange={(event) =>
                updatePaletteColor(selectedPaletteColor, event.target.value)
              }
            />
            <code>{palette.colors[selectedPaletteColor]}</code>
          </label>
        )}
        <div className="style-targets" aria-label="Color target">
          <AppButton
            className={paletteTarget === "fill" ? "active" : ""}
            onClick={() => setPaletteTarget("fill")}
          >
            <span
              className={fillColor ? "" : "none"}
              style={fillColor ? { backgroundColor: fillColor } : undefined}
            />
            Fill
          </AppButton>
          <AppButton
            className={paletteTarget === "stroke" ? "active" : ""}
            onClick={() => setPaletteTarget("stroke")}
          >
            <span
              className={strokeColor ? "" : "none"}
              style={strokeColor ? { backgroundColor: strokeColor } : undefined}
            />
            Stroke
          </AppButton>
        </div>
        <AppInput
          label="Stroke width"
          min={0}
          step={0.5}
          value={strokeWidth}
          fallback={2}
          onCommit={onStrokeWidthChange}
        />
        <input
          ref={colorInputRef}
          className="palette-color-editor"
          type="color"
          value={
            editingColorIndex === null
              ? "#000000"
              : (palette.colors[editingColorIndex] ?? "#000000")
          }
          onChange={(event) => {
            if (editingColorIndex !== null)
              updatePaletteColor(editingColorIndex, event.target.value);
          }}
          onBlur={() => setEditingColorIndex(null)}
          aria-label="Edit palette color"
        />
        {paletteMenu && (
          <div
            className="palette-context-menu"
            style={{ left: paletteMenu.x, top: paletteMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <AppButton
              onClick={() => openPaletteColorEditor(paletteMenu.index)}
            >
              Edit color
            </AppButton>
            <AppButton
              disabled={palette.colors.length === 1}
              onClick={() => {
                removePaletteColor(paletteMenu.index);
                setPaletteMenu(null);
              }}
            >
              Delete color
            </AppButton>
          </div>
        )}
      </div>
      <div className="inspector-title">
        <span>
          <SlidersHorizontal /> Design
        </span>
        {selected && <small>{selected.type}</small>}
      </div>
      {selected ? (
        <>
          {selected.type === "rect" && (
            <AppInput
              label="Radius"
              min={0}
              value={radius}
              fallback={0}
              onCommit={onRadiusChange}
            />
          )}
          <div className="inspector-grid">
            <AppInput
              label="X"
              value={Math.round(selected.left ?? 0)}
              fallback={0}
              integer
              onCommit={(value) => onPositionChange("left", value)}
            />
            <AppInput
              label="Y"
              value={Math.round(selected.top ?? 0)}
              fallback={0}
              integer
              onCommit={(value) => onPositionChange("top", value)}
            />
          </div>
          <div className="inspector-grid">
            <AppInput
              label="W"
              min={1}
              value={Math.round(
                (selected.width ?? 0) * Math.abs(selected.scaleX ?? 1),
              )}
              fallback={1}
              integer
              onCommit={(value) => onSizeChange("width", value)}
            />
            <AppInput
              label="H"
              min={1}
              value={Math.round(
                (selected.height ?? 0) * Math.abs(selected.scaleY ?? 1),
              )}
              fallback={1}
              integer
              onCommit={(value) => onSizeChange("height", value)}
            />
          </div>
        </>
      ) : (
        <div className="empty-inspector">
          <div>
            <SlidersHorizontal />
          </div>
          <p>Select an object to edit its appearance and position.</p>
        </div>
      )}
    </aside>
  );
}
