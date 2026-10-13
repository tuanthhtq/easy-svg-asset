import { useEffect, useState, type InputHTMLAttributes } from "react";
import { liveInputValue, normalizeInputValue } from "./appInputValue";

type AppInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | "max"
  | "min"
  | "onBlur"
  | "onChange"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseUp"
  | "type"
  | "value"
> & {
  label: string;
  value: number;
  fallback: number;
  min?: number;
  max?: number;
  integer?: boolean;
  onCommit: (value: number) => void;
};

export function AppInput({
  label,
  value,
  fallback,
  min,
  max,
  integer = false,
  onCommit,
  ...props
}: AppInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    const next = normalizeInputValue(draft, fallback, min, max, integer);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  function commitLive(draftValue: string) {
    const next = liveInputValue(draftValue, min, max, integer);
    if (next !== null && next !== value) onCommit(next);
  }

  return (
    <label className="app-input">
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onKeyUp={(event) => {
          commitLive(event.currentTarget.value);
        }}
        onMouseUp={(event) => commitLive(event.currentTarget.value)}
        {...props}
      />
    </label>
  );
}
