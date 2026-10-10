import { AppError, photoSchema } from "@couple/domain";

export async function cleanPhoto(file: File): Promise<Blob> {
  photoSchema.parse(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError("PHOTO_DECODE_ERROR");
  }
  const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new AppError("VALIDATION_ERROR");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new AppError("VALIDATION_ERROR")),
      "image/webp",
      0.85,
    ),
  );
  photoSchema.parse(blob);
  return blob;
}
