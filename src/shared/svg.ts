const unsafe =
  /<(?:script|foreignObject|iframe|object|embed|image|use)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=|url\s*\((?!\s*#)|<!DOCTYPE/i;

const editorBackground =
  /(<\/defs>\s*)<rect x="0" y="0" width="100%" height="100%" fill="#fbfaf7"><\/rect>\s*/i;

export function stripEditorBackground(value: string) {
  return value.replace(editorBackground, "$1");
}

export function validateSvg(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 6 ||
    value.length > 5_000_000 ||
    !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(value) ||
    unsafe.test(value)
  )
    throw new Error("Unsupported or unsafe SVG");
  return value;
}
