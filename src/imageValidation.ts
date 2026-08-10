export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB

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
