import { useEffect, useState } from "react";
import type { AppSettings, AppSettingsInput } from "../../../shared/types";

type SettingsProps = {
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettingsInput) => Promise<void>;
};

export function Settings({ settings, onClose, onSave }: SettingsProps) {
  const [draft, setDraft] = useState<AppSettingsInput>({ ...settings });
  const [secret, setSecret] = useState("");
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
        className="settings-dialog"
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
              setDraft({ ...draft, autoSaveDelay: Number(event.target.value) })
            }
          />
        </label>
        <label>
          OpenAI API URL
          <input
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
        {error && <p className="ai-error">{error}</p>}
        <div className="settings-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary-action"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </section>
    </div>
  );
}
