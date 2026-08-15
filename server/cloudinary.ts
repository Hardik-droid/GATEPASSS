import { v2 as cloudinary } from "cloudinary";
import { config } from "./config.js";

function initCloudinary(): boolean {
  if (config.CLOUDINARY_URL) {
    cloudinary.config({
      cloudinary_url: config.CLOUDINARY_URL,
      secure: true,
    });
    return true;
  }
  if (config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
      secure: true,
    });
    return true;
  }
  return false;
}

export const isCloudinaryAvailable = initCloudinary();

export async function uploadToCloudinary(
  data: Buffer,
  contentType: string,
  folder = "gatepass/event_covers"
): Promise<{ url: string; publicId: string } | null> {
  if (!initCloudinary()) return null;

  try {
    const base64Data = `data:${contentType};base64,${data.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64Data, {
      folder,
      resource_type: "image",
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.warn("Cloudinary upload error, falling back to local database store:", error);
    return null;
  }
}
