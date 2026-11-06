/**
 * Cloudinary — storage *and* the crop.
 * Uploads are signed here (server) and sent straight from the browser, so the
 * Vercel function body limit is never in the path. See SETUP.md step 3.
 */
import { v2 as cloudinary } from "cloudinary"
import { env } from "./env"

export function cloudinaryConfigured(): boolean {
  const e = env()
  return Boolean(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET)
}

function cloud() {
  const e = env()
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary is not connected — fill CLOUDINARY_* in .env.local (SETUP.md step 3)")
  }
  cloudinary.config({
    cloud_name: e.CLOUDINARY_CLOUD_NAME,
    api_key: e.CLOUDINARY_API_KEY,
    api_secret: e.CLOUDINARY_API_SECRET,
    secure: true,
  })
  return cloudinary
}

/** Short-lived direct-upload parameters for the browser. */
export function signedUpload(folder: string) {
  const e = env()
  const c = cloud()
  const timestamp = Math.round(Date.now() / 1000)
  const params = { folder, timestamp }
  const signature = c.utils.api_sign_request(params, e.CLOUDINARY_API_SECRET as string)
  return {
    cloudName: e.CLOUDINARY_CLOUD_NAME,
    apiKey: e.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/auto/upload`,
  }
}

/**
 * The board transform: trim the screenshot's chrome, normalise to a padded portrait tile,
 * deliver WebP at the right size. Applied at delivery, so the original is never edited.
 */
export function boardImageUrl(publicId: string, width = 900): string {
  const c = cloud()
  return c.url(publicId, {
    transformation: [
      { effect: "trim:20" },
      { crop: "fill", width, height: Math.round(width * 1.333), gravity: "auto" },
      { quality: "auto", fetch_format: "auto" },
    ],
    secure: true,
  })
}

/** Store a generated PDF (a Shippo label) and return its secure URL. */
export async function uploadRaw(buffer: Buffer, publicId: string): Promise<string> {
  const c = cloud()
  return new Promise((resolve, reject) => {
    c.uploader
      .upload_stream({ resource_type: "raw", public_id: publicId, folder: "pull/labels" }, (error, result) => {
        if (error || !result) return reject(error ?? new Error("upload failed"))
        resolve(result.secure_url)
      })
      .end(buffer)
  })
}
