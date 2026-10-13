import { useRef, useState } from "react";
import { Check, ChevronDown, ImagePlus, Sparkles, X } from "lucide-react";
import type { AiCommand, AiResponse, AiSceneContext } from "../../../shared/ai";
import { resizePromptImage } from "./promptImage";

type AiBoxProps = {
  scene: AiSceneContext;
  onApply: (response: AiResponse) => boolean;
};

export function AiBox({ scene, onApply }: AiBoxProps) {
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
      const next = await window.studio.runAi({
        prompt: prompt.trim(),
        image,
        scene,
      });
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

  function summary(command: AiCommand) {
    if (command.kind === "create_shape") return `Tạo ${command.shape.name}`;
    if (command.kind === "create_asset")
      return `Asset: ${command.groupName} (${command.children.length} shape)`;
    if (command.kind === "generate_palette")
      return `Palette: ${command.paletteName}`;
    return `Tô màu ${command.changes.length} object`;
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
            <button
              className="primary-action"
              disabled={busy || !prompt.trim()}
              onClick={() => void run()}
            >
              <Sparkles />
              {busy ? "Đang nghĩ..." : "Đề xuất"}
            </button>
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
              <p>{response.message}</p>
              {response.commands.map((command, index) => (
                <div className="ai-command" key={`${command.kind}-${index}`}>
                  {summary(command)}
                </div>
              ))}
              {response.commands.length > 0 && (
                <div className="ai-review-actions">
                  <button
                    className="primary-action"
                    onClick={() => {
                      if (onApply(response)) setResponse(null);
                    }}
                  >
                    <Check /> Apply
                  </button>
                  <button onClick={() => setResponse(null)}>
                    <X /> Reject
                  </button>
                </div>
              )}
            </div>
          )}
          {error && <p className="ai-error">{error}</p>}
        </div>
      )}
    </aside>
  );
}
