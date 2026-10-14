import { useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ImagePlus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { AiResponse, AiSceneContext } from "../../../shared/ai";
import type { AiStylePreset } from "../../../shared/types";
import { resizePromptImage } from "./promptImage";

type AiBoxProps = {
  scene: AiSceneContext;
  onPreview: (response: AiResponse) => void;
  onApprove: (response: AiResponse) => boolean;
  onReject: () => void;
  stylePresets: AiStylePreset[];
  activeStylePresetId: string;
  onStylePresetChange: (id: string) => void;
  onManageStyles: () => void;
};

export function AiBox({
  scene,
  onPreview,
  onApprove,
  onReject,
  stylePresets,
  activeStylePresetId,
  onStylePresetChange,
  onManageStyles,
}: AiBoxProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<{ mimeType: string; data: string } | null>(
    null,
  );
  const [response, setResponse] = useState<AiResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function readImage(file: File) {
    try {
      setImage(await resizePromptImage(file));
      setError("");
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function run() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      if (response) {
        onReject();
        setResponse(null);
      }
      const preset =
        stylePresets.find((item) => item.id === activeStylePresetId) ??
        stylePresets[0];
      if (!preset) throw new Error("Create an AI style preset first");
      const referenceImages = await Promise.all(
        preset.referenceImages.map(async (reference) => ({
          ...reference,
          ...(await window.studio.loadAiStyleReference(
            preset.id,
            reference.id,
          )),
        })),
      );
      const next = await window.studio.runAi({
        prompt: prompt.trim(),
        image,
        stylePreset: { ...preset, referenceImages },
        scene,
      });
      onPreview(next);
      setResponse(next);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function paste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = [...event.clipboardData.files][0];
    if (file) void readImage(file);
  }

  function reject() {
    onReject();
    setResponse(null);
    setError("");
  }

  function approve() {
    if (!response) return;
    if (onApprove(response)) {
      setResponse(null);
      setError("");
    }
  }

  return (
    <aside className={open ? "ai-box open" : "ai-box"}>
      <button
        className="ai-box-heading"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          <Sparkles /> AI assistant
        </span>
        <ChevronDown className={open ? "rotate" : ""} />
      </button>
      {open && (
        <div className="ai-box-content">
          <div className="ai-style-picker">
            <select
              aria-label="AI style preset"
              value={activeStylePresetId}
              onChange={(event) => onStylePresetChange(event.target.value)}
            >
              {stylePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button onClick={onManageStyles}>Manage</button>
          </div>
          <textarea
            aria-label="AI prompt"
            value={prompt}
            placeholder="Ví dụ: tạo một ô đất cạnh khu nhà..."
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={paste}
            rows={3}
          />
          <div className="ai-box-actions">
            <button
              title="Paste image"
              aria-label="Paste image"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus />
              {image ? "Ảnh đã chọn" : "Ảnh"}
            </button>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readImage(file);
              }}
            />
            {!response && (
              <button
                className="primary-action"
                disabled={busy || !prompt.trim()}
                onClick={() => void run()}
              >
                <Sparkles />
                {busy ? "Đang tạo..." : "Đề xuất"}
              </button>
            )}
          </div>
          {image && (
            <div className="ai-image-preview">
              <img
                src={`data:${image.mimeType};base64,${image.data}`}
                alt="Ảnh đính kèm cho AI"
              />
              <button onClick={() => setImage(null)}>Bỏ ảnh</button>
            </div>
          )}
          {response && (
            <div className="ai-review">
              <p>
                {response.commands.some(
                  (command) =>
                    command.kind === "create_shape" ||
                    command.kind === "create_asset",
                )
                  ? "Preview đang hiển thị trên canvas."
                  : response.message}
              </p>
              {response.commands.map((command, index) =>
                command.kind === "generate_palette" ? (
                  <section
                    className="ai-palette-review"
                    aria-label={`Palette proposal: ${command.paletteName}`}
                    key={`${command.paletteName}-${index}`}
                  >
                    <div className="ai-palette-review-heading">
                      <span>
                        {command.mode === "create"
                          ? "Tạo palette mới"
                          : "Cập nhật palette"}
                      </span>
                      <small>Chưa áp dụng</small>
                    </div>
                    <strong>{command.paletteName}</strong>
                    <div className="ai-palette-colors">
                      {command.colors.map((color) => (
                        <div className="ai-palette-color" key={color}>
                          <span style={{ backgroundColor: color }} />
                          <code>{color.toUpperCase()}</code>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
              <div className="ai-review-actions">
                <button
                  className="ai-regenerate"
                  disabled={busy || !prompt.trim()}
                  onClick={() => void run()}
                >
                  <RefreshCw /> {busy ? "Đang tạo..." : "Regenerate"}
                </button>
                <button onClick={reject}>
                  <X /> Reject
                </button>
                {response.commands.length > 0 && (
                  <button className="primary-action" onClick={approve}>
                    <Check /> Approve
                  </button>
                )}
              </div>
            </div>
          )}
          {error && <p className="ai-error">{error}</p>}
        </div>
      )}
    </aside>
  );
}
