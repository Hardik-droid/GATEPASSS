export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
// Vercel Functions cap request and response payloads at 4.5 MB, while the
// event_images table intentionally caps stored images at 4 MiB.
export const MAX_STORED_IMAGE_BYTES = 4 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/x-png",
  "image/pjpeg"
]);

export interface ImageValidationResult {
  ok: boolean;
  code?: "NO_FILE" | "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_FORMAT" | "INVALID_IMAGE" | "DECODE_ERROR";
  message: string;
  detectedFormat?: "png" | "jpeg" | "webp";
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
}

/**
 * Detect real image format using binary file signature (magic bytes).
 * Supports PNG, JPEG, and WebP formats.
 */
export async function detectImageFormat(
  input: Blob | Buffer | Uint8Array | ArrayBuffer
): Promise<"png" | "jpeg" | "webp" | null> {
  let bytes: Uint8Array;
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const buffer = await input.slice(0, 16).arrayBuffer();
    bytes = new Uint8Array(buffer);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input, 0, Math.min(16, input.byteLength));
  } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, Math.min(16, input.byteLength));
  } else if (input instanceof Uint8Array) {
    bytes = input.subarray(0, 16);
  } else {
    return null;
  }

  if (bytes.length < 3) return null;

  // PNG Magic Bytes: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  // JPEG Magic Bytes: FF D8 FF
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  // WebP Magic Bytes: RIFF (bytes 0..3) + WEBP (bytes 8..11)
  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP";

  if (isPng) return "png";
  if (isJpeg) return "jpeg";
  if (isWebp) return "webp";

  return null;
}

/**
 * Validates an image file thoroughly using size, extension, MIME type,
 * magic bytes signature, and browser decodability.
 */
export async function validateImageFile(file: unknown): Promise<ImageValidationResult> {
  if (typeof window !== "undefined" && !(file instanceof File) && !(file instanceof Blob)) {
    return {
      ok: false,
      code: "NO_FILE",
      message: "Please select an image file."
    };
  }

  const blob = file as Blob;

  if (!blob || blob.size <= 0) {
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: "The selected file is empty."
    };
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `Image exceeds the 50 MB upload limit (Selected file is ${sizeMB} MB).`
    };
  }

  const fileName = (file as File).name || "";
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const extensionAllowed = ALLOWED_EXTENSIONS.has(extension);

  const fileType = blob.type?.toLowerCase() || "";
  const mimeAllowed =
    !fileType ||
    ALLOWED_MIME_TYPES.has(fileType) ||
    fileType === "application/octet-stream";

  // Binary magic byte verification
  const detectedFormat = await detectImageFormat(blob);

  if (!detectedFormat) {
    if (!extensionAllowed && !mimeAllowed) {
      return {
        ok: false,
        code: "UNSUPPORTED_FORMAT",
        message: "Supported formats: JPG, PNG and WebP."
      };
    }
    return {
      ok: false,
      code: "INVALID_IMAGE",
      message: "The selected file is not a valid JPG, PNG or WebP image."
    };
  }

  const mimeType: "image/png" | "image/jpeg" | "image/webp" =
    detectedFormat === "png"
      ? "image/png"
      : detectedFormat === "jpeg"
      ? "image/jpeg"
      : "image/webp";

  // Test decoding if in browser environment
  if (typeof window !== "undefined" && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
    } catch (err) {
      console.error("Image bitmap decode failure:", err);
      return {
        ok: false,
        code: "DECODE_ERROR",
        message: "The selected image appears to be corrupted or unsupported."
      };
    }
  }

  return {
    ok: true,
    message: "Image format and size are valid.",
    detectedFormat,
    mimeType
  };
}

/**
 * Prepares a web-ready Blob for image upload.
 * Files may be selected up to 50 MB, but the body sent through the Vercel
 * Function must fit the database and hosting limits. Images already within
 * that boundary are preserved; larger images are re-encoded and downscaled
 * until the encoded payload is at most 4 MiB.
 */
export async function prepareWebReadyImage(file: File): Promise<{ blob: Blob; mimeType: string; fileName: string }> {
  const validation = await validateImageFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const mimeType = validation.mimeType || "image/png";

  if (file.size <= MAX_STORED_IMAGE_BYTES) {
    return { blob: file, mimeType, fileName: file.name };
  }

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof createImageBitmap !== "function"
  ) {
    throw new Error("This image must be reduced below 4 MB before it can be uploaded.");
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const maxDimension = 1920;
    let width = bitmap.width;
    let height = bitmap.height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement("canvas");

    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;

      ctx.drawImage(bitmap, 0, 0, width, height);
      const optimizedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/webp", Math.max(0.6, 0.9 - attempt * 0.06));
      });

      if (optimizedBlob && optimizedBlob.size <= MAX_STORED_IMAGE_BYTES) {
        const outputType = optimizedBlob.type === "image/webp" ? "image/webp" : "image/png";
        return {
          blob: optimizedBlob,
          mimeType: outputType,
          fileName: file.name.replace(/\.[^/.]+$/, "") + (outputType === "image/webp" ? ".webp" : ".png")
        };
      }

      const shrink = optimizedBlob?.size
        ? Math.min(0.85, Math.sqrt(MAX_STORED_IMAGE_BYTES / optimizedBlob.size) * 0.92)
        : 0.8;
      width = Math.max(1, Math.round(width * shrink));
      height = Math.max(1, Math.round(height * shrink));
    }
  } catch (err) {
    console.warn("Client-side image optimization failed:", err);
  } finally {
    bitmap?.close();
  }

  throw new Error("This image could not be reduced below 4 MB. Please resize it and try again.");
}
