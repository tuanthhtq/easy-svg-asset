import { Copy, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AiStylePreset, AiStyleView } from "../../../shared/types";
import { resizePromptImage } from "./promptImage";

const VIEWS: Array<{ value: AiStyleView; label: string }> = [
  { value: "orthographic_top_down", label: "Orthographic top-down" },
  { value: "three_quarter_top_down", label: "3/4 top-down RPG" },
  { value: "isometric", label: "Isometric" },
  { value: "freeform", label: "Freeform" },
];

type Props = {
  presets: AiStylePreset[];
  onSave: (preset: AiStylePreset) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onChange: (presets: AiStylePreset[]) => void;
};

export function AiStylePresetManager({
  presets,
  onSave,
  onDuplicate,
  onDelete,
  onChange,
}: Props) {
  const [selectedId, setSelectedId] = useState(presets[0]?.id ?? "");
  const selected = presets.find((preset) => preset.id === selectedId);
  const [draft, setDraft] = useState<AiStylePreset | null>(selected ?? null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selected && presets[0]) {
      setSelectedId(presets[0].id);
      setDraft(presets[0]);
    }
  }, [presets, selected]);

  useEffect(() => {
    if (!selected) {
      setPreviews({});
      return;
    }
    let active = true;
    void Promise.all(
      selected.referenceImages.map(async (reference) => {
        const image = await window.studio.loadAiStyleReference(
          selected.id,
          reference.id,
        );
        return [
          reference.id,
          `data:${image.mimeType};base64,${image.data}`,
        ] as const;
      }),
    )
      .then((entries) => active && setPreviews(Object.fromEntries(entries)))
      .catch((cause) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [selected]);

  function select(preset: AiStylePreset) {
    setSelectedId(preset.id);
    setDraft(preset);
    setError("");
  }

  function create() {
    const preset: AiStylePreset = {
      id: `preset-${crypto.randomUUID()}`,
      name: "New style",
      isDefault: false,
      instruction: "",
      terrainView: "orthographic_top_down",
      propView: "three_quarter_top_down",
      buildingView: "three_quarter_top_down",
      noVisibleSideFacesForTerrain: true,
      detailLevel: "minimal",
      referenceImages: [],
    };
    setSelectedId(preset.id);
    setDraft(preset);
    setPreviews({});
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addReference(file: File) {
    if (!draft || !selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await window.studio.addAiStyleReference(
        draft.id,
        file.name,
        await resizePromptImage(file),
      );
      onChange(next);
      setDraft(next.find((preset) => preset.id === draft.id) ?? draft);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeReference(referenceId: string) {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await window.studio.removeAiStyleReference(
        draft.id,
        referenceId,
      );
      onChange(next);
      setDraft(next.find((preset) => preset.id === draft.id) ?? draft);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!draft) return null;

  return (
    <div className="style-preset-manager">
      <aside className="style-preset-list">
        <div className="style-preset-list-heading">
          <strong>Style presets</strong>
          <button title="New preset" aria-label="New preset" onClick={create}>
            <Plus />
          </button>
        </div>
        {presets.map((preset) => (
          <button
            className={preset.id === selectedId ? "active" : ""}
            key={preset.id}
            onClick={() => select(preset)}
          >
            <span>{preset.name}</span>
            <small>
              {preset.isDefault ? "Default · " : ""}
              {preset.referenceImages.length} refs
            </small>
          </button>
        ))}
      </aside>
      <section className="style-preset-editor">
        <div className="style-preset-editor-heading">
          <input
            aria-label="Preset name"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          <div>
            <button
              title="Duplicate preset"
              aria-label="Duplicate preset"
              disabled={!selected || busy}
              onClick={() => selected && void onDuplicate(selected.id)}
            >
              <Copy />
            </button>
            <button
              title="Delete preset"
              aria-label="Delete preset"
              disabled={
                !selected || selected.id === "default-game-assets" || busy
              }
              onClick={() => {
                if (
                  selected &&
                  window.confirm(`Delete style preset "${selected.name}"?`)
                )
                  void onDelete(selected.id);
              }}
            >
              <Trash2 />
            </button>
          </div>
        </div>
        <label>
          Custom instruction
          <textarea
            rows={3}
            value={draft.instruction}
            placeholder="Shape language, lighting, forbidden details..."
            onChange={(event) =>
              setDraft({ ...draft, instruction: event.target.value })
            }
          />
        </label>
        <div className="style-rule-grid">
          {(
            [
              ["terrainView", "Terrain"],
              ["propView", "Props"],
              ["buildingView", "Buildings"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                value={draft[key]}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    [key]: event.target.value as AiStyleView,
                  })
                }
              >
                {VIEWS.map((view) => (
                  <option key={view.value} value={view.value}>
                    {view.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Detail level
            <select
              value={draft.detailLevel}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  detailLevel: event.target
                    .value as AiStylePreset["detailLevel"],
                })
              }
            >
              <option value="minimal">Minimal</option>
              <option value="moderate">Moderate</option>
              <option value="rich">Rich</option>
            </select>
          </label>
        </div>
        <label className="style-check">
          <input
            type="checkbox"
            checked={draft.noVisibleSideFacesForTerrain}
            onChange={(event) =>
              setDraft({
                ...draft,
                noVisibleSideFacesForTerrain: event.target.checked,
              })
            }
          />
          Terrain has no visible side faces
        </label>
        <label className="style-check">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(event) =>
              event.target.checked && setDraft({ ...draft, isDefault: true })
            }
          />
          Default for projects without a selected preset
        </label>
        <div className="style-reference-heading">
          <div>
            <strong>Reference images</strong>
            <small> Up to 3 images, 5 MB total.</small>
          </div>
          <button
            disabled={!selected || draft.referenceImages.length >= 3 || busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload /> Add image
          </button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void addReference(file);
            }}
          />
        </div>
        <div className="style-reference-grid">
          {draft.referenceImages.map((reference) => (
            <figure key={reference.id}>
              {previews[reference.id] && (
                <img src={previews[reference.id]} alt={reference.name} />
              )}
              <figcaption title={reference.name}>{reference.name}</figcaption>
              <button
                title="Remove reference"
                aria-label={`Remove ${reference.name}`}
                disabled={busy}
                onClick={() => void removeReference(reference.id)}
              >
                <X />
              </button>
            </figure>
          ))}
          {!draft.referenceImages.length && (
            <p>No reference images. Rules still apply.</p>
          )}
        </div>
        {error && <p className="ai-error">{error}</p>}
        <button
          className="primary-action style-save"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving..." : selected ? "Save preset" : "Create preset"}
        </button>
      </section>
    </div>
  );
}
