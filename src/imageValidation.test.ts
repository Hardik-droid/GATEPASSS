import assert from "node:assert/strict";
import test from "node:test";
import {
  validateImageFile,
  detectImageFormat,
  MAX_STORED_IMAGE_BYTES,
  prepareWebReadyImage
} from "./imageValidation";

function createFakeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes], name, { type });
}

function createPngBytes(sizeInBytes: number): Uint8Array {
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const data = new Uint8Array(Math.max(header.length, sizeInBytes));
  data.set(header, 0);
  return data;
}

function createJpegBytes(sizeInBytes: number): Uint8Array {
  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const data = new Uint8Array(Math.max(header.length, sizeInBytes));
  data.set(header, 0);
  return data;
}

function createWebpBytes(sizeInBytes: number): Uint8Array {
  const header = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // length
    0x57, 0x45, 0x42, 0x50  // WEBP
  ]);
  const data = new Uint8Array(Math.max(header.length, sizeInBytes));
  data.set(header, 0);
  return data;
}

test("detectImageFormat detects valid PNG, JPEG, and WebP magic bytes", async () => {
  const pngBytes = createPngBytes(100);
  assert.equal(await detectImageFormat(pngBytes), "png");

  const jpegBytes = createJpegBytes(100);
  assert.equal(await detectImageFormat(jpegBytes), "jpeg");

  const webpBytes = createWebpBytes(100);
  assert.equal(await detectImageFormat(webpBytes), "webp");

  const bogusBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  assert.equal(await detectImageFormat(bogusBytes), null);
});

test("validateImageFile accepts valid PNGs across various sizes (500KB to 49MB)", async () => {
  const sizes = [
    500 * 1024,
    2 * 1024 * 1024,
    6 * 1024 * 1024, // 6 MB PNG (The user reported bug case!)
    20 * 1024 * 1024,
    49 * 1024 * 1024
  ];

  for (const size of sizes) {
    const file = createFakeFile(createPngBytes(size), "test.png", "image/png");
    const result = await validateImageFile(file);
    assert.equal(result.ok, true, `Expected valid for PNG size ${size}`);
    assert.equal(result.detectedFormat, "png");
  }
});

test("validateImageFile accepts valid PNGs when browser provides empty file.type or octet-stream", async () => {
  // Common issue where browser returns file.type === "" or application/octet-stream
  const fileEmptyMime = createFakeFile(createPngBytes(6 * 1024 * 1024), "photo.png", "");
  const resultEmptyMime = await validateImageFile(fileEmptyMime);
  assert.equal(resultEmptyMime.ok, true);
  assert.equal(resultEmptyMime.mimeType, "image/png");

  const fileOctetStream = createFakeFile(createPngBytes(6 * 1024 * 1024), "photo.png", "application/octet-stream");
  const resultOctetStream = await validateImageFile(fileOctetStream);
  assert.equal(resultOctetStream.ok, true);
  assert.equal(resultOctetStream.mimeType, "image/png");
});

test("validateImageFile accepts valid JPGs and WebP files", async () => {
  const jpgFile = createFakeFile(createJpegBytes(2 * 1024 * 1024), "banner.jpg", "image/jpeg");
  const jpgResult = await validateImageFile(jpgFile);
  assert.equal(jpgResult.ok, true);
  assert.equal(jpgResult.detectedFormat, "jpeg");

  const webpFile = createFakeFile(createWebpBytes(3 * 1024 * 1024), "banner.webp", "image/webp");
  const webpResult = await validateImageFile(webpFile);
  assert.equal(webpResult.ok, true);
  assert.equal(webpResult.detectedFormat, "webp");
});

test("validateImageFile rejects files larger than 50 MB", async () => {
  const file51MB = createFakeFile(createPngBytes(51 * 1024 * 1024), "large.png", "image/png");
  const result = await validateImageFile(file51MB);
  assert.equal(result.ok, false);
  assert.equal(result.code, "FILE_TOO_LARGE");
  assert.ok(result.message.includes("50 MB"));
});

test("validateImageFile rejects non-image text files renamed to .png (magic bytes fail)", async () => {
  const textBytes = new TextEncoder().encode("Hello world! This is text content.");
  const fakePng = createFakeFile(textBytes, "spoofed.png", "image/png");
  const result = await validateImageFile(fakePng);
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_IMAGE");
});

test("validateImageFile rejects empty files", async () => {
  const emptyFile = createFakeFile(new Uint8Array(0), "empty.png", "image/png");
  const result = await validateImageFile(emptyFile);
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMPTY_FILE");
});

test("prepareWebReadyImage keeps the encoded upload within the 4 MiB storage boundary", async () => {
  const globals = globalThis as any;
  const originalWindow = globals.window;
  const originalDocument = globals.document;
  const originalCreateImageBitmap = globals.createImageBitmap;
  let encodeCount = 0;

  globals.window = {};
  globals.createImageBitmap = async () => ({
    width: 4000,
    height: 2000,
    close() {}
  });
  globals.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: (callback: (blob: Blob) => void, type: string) => {
        encodeCount += 1;
        const size = encodeCount === 1 ? MAX_STORED_IMAGE_BYTES + 1 : MAX_STORED_IMAGE_BYTES - 1;
        callback(new Blob([new Uint8Array(size)], { type }));
      }
    })
  };

  try {
    const file = createFakeFile(createPngBytes(6 * 1024 * 1024), "reported-case.png", "image/png");
    const prepared = await prepareWebReadyImage(file);
    assert.ok(prepared.blob.size <= MAX_STORED_IMAGE_BYTES);
    assert.equal(prepared.mimeType, "image/webp");
    assert.equal(encodeCount, 2);
  } finally {
    if (originalWindow === undefined) delete globals.window;
    else globals.window = originalWindow;
    if (originalDocument === undefined) delete globals.document;
    else globals.document = originalDocument;
    if (originalCreateImageBitmap === undefined) delete globals.createImageBitmap;
    else globals.createImageBitmap = originalCreateImageBitmap;
  }
});
