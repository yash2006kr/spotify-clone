import type { GridFSBucket, ObjectId } from "mongodb";

export function isNonEmptyFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && value.size > 0;
}

export function fieldValue(value: FormDataEntryValue | null, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function numberField(value: FormDataEntryValue | null, fallback = 0) {
  const next = Number(typeof value === "string" ? value : fallback);
  return Number.isFinite(next) ? next : fallback;
}

export function filenameWithoutExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function cleanFilename(filename: string) {
  return filename.replace(/[^\w.\- ]+/g, "").slice(0, 120) || "upload";
}

export async function uploadFileToGridFS(
  bucket: GridFSBucket,
  file: File,
  metadata: Record<string, unknown>
): Promise<ObjectId> {
  const buffer = Buffer.from(await file.arrayBuffer());

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(cleanFilename(file.name), {
      metadata: {
        ...metadata,
        contentType: file.type || "application/octet-stream"
      }
    });

    uploadStream.once("finish", () => resolve(uploadStream.id));
    uploadStream.once("error", reject);
    uploadStream.end(buffer);
  });
}
