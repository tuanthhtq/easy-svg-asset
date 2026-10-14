import { useEffect, useState } from "react";
import { AI_REASONING_EFFORTS } from "../../../shared/types";
import type { AppSettings, AppSettingsInput } from "../../../shared/types";
import type { AiStylePreset } from "../../../shared/types";
import { AiStylePresetManager } from "./AiStylePresetManager";

type SettingsProps = {
  settings: AppSettings;
  initialTab: "general" | "ai" | "styles";
  stylePresets: AiStylePreset[];
  onClose: () => void;
  onSave: (settings: AppSettingsInput) => Promise<void>;
  onSaveStylePreset: (preset: AiStylePreset) => Promise<void>;
  onDuplicateStylePreset: (id: string) => Promise<void>;
  onDeleteStylePreset: (id: string) => Promise<void>;
  onStylePresetsChange: (presets: AiStylePreset[]) => void;
};

export function Settings({
  settings,
  initialTab,
  stylePresets,
  onClose,
  onSave,
  onSaveStylePreset,
  onDuplicateStylePreset,
  onDeleteStylePreset,
  onStylePresetsChange,
}: SettingsProps) {
  const [draft, setDraft] = useState<AppSettingsInput>({ ...settings });
  const [secret, setSecret] = useState("");
  const [tab, setTab] = useState<"general" | "ai" | "styles">(initialTab);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setDraft({ ...settings }), [settings]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  async function save() {
    setSaving(true);
    setError("");
    try {
      if (tab !== "styles")
        await onSave({ ...draft, aiSecret: secret || undefined });
      onClose();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="settings-backdrop" role="presentation">
      <section
        className={
          tab === "styles" ? "settings-dialog wide" : "settings-dialog"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-heading">
          <div>
            <span className="eyebrow">App</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button aria-label="Close settings" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="settings-tabs" role="tablist" aria-label="Settings">
          <button
            role="tab"
            aria-selected={tab === "general"}
            onClick={() => setTab("general")}
          >
            General
          </button>
          <button
            role="tab"
            aria-selected={tab === "ai"}
            onClick={() => setTab("ai")}
          >
            AI Config
          </button>
          <button
            role="tab"
            aria-selected={tab === "styles"}
            onClick={() => setTab("styles")}
          >
            Style Presets
          </button>
        </div>
        <div className="settings-panel" role="tabpanel">
          {tab === "styles" ? (
            <AiStylePresetManager
              presets={stylePresets}
              onSave={onSaveStylePreset}
              onDuplicate={onDuplicateStylePreset}
              onDelete={onDeleteStylePreset}
              onChange={onStylePresetsChange}
            />
          ) : tab === "general" ? (
            <label>
              Auto-save delay (ms)
              <input
                autoFocus
                type="number"
                min={100}
                max={10000}
                step={100}
                value={draft.autoSaveDelay}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    autoSaveDelay: Number(event.target.value),
                  })
                }
              />
            </label>
          ) : (
            <>
              <label>
                OpenAI API URL
                <input
                  autoFocus
                  value={draft.aiApiUrl}
                  onChange={(event) =>
                    setDraft({ ...draft, aiApiUrl: event.target.value })
                  }
                />
              </label>
              <label>
                OpenAI model
                <input
                  value={draft.aiModel}
                  placeholder="OpenAI model name"
                  onChange={(event) =>
                    setDraft({ ...draft, aiModel: event.target.value })
                  }
                />
              </label>
              <label>
                Thinking effort
                <select
                  value={draft.aiReasoningEffort}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      aiReasoningEffort: event.target
                        .value as AppSettingsInput["aiReasoningEffort"],
                    })
                  }
                >
                  {AI_REASONING_EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      Thinking: {effort[0].toUpperCase() + effort.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                API secret
                {settings.hasAiSecret && (
                  <small> Secret đã lưu, nhập mới để thay thế.</small>
                )}
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        {error && <p className="ai-error">{error}</p>}
        <div className="settings-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary-action"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : tab === "styles" ? "Done" : "Save settings"}
          </button>
        </div>
      </section>
    </div>
  );
}
