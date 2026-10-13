import type { AiImage } from "../../../shared/ai";

const MAX_IMAGE_BYTES = 5_000_000;
const MAX_IMAGE_SIDE = 1600;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function fitImageSize(width: number, height: number) {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function resizePromptImage(file: File): Promise<AiImage> {
  if (!IMAGE_TYPES.has(file.type))
    throw new Error("Ảnh cần là PNG, JPEG hoặc WebP");
  const bitmap = await createImageBitmap(file);
  try {
    const size = fitImageSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không thể xử lý ảnh");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Không thể xử lý ảnh")),
        file.type,
        file.type === "image/png" ? undefined : 0.85,
      ),
    );
    if (blob.size > MAX_IMAGE_BYTES)
      throw new Error("Ảnh sau khi resize vẫn vượt quá 5 MB");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return {
      mimeType: blob.type,
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    };
  } finally {
    bitmap.close();
  }
}
