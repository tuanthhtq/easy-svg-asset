const unsafe =
  /<(?:script|foreignObject|iframe|object|embed|image|use)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=|url\s*\((?!\s*#)|<!DOCTYPE/i;
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
