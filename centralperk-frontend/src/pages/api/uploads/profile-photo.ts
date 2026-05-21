import type { NextApiRequest, NextApiResponse } from "next";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function safeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "member";
}

function resolveFrontendRoot() {
  const cwd = process.cwd();
  return path.basename(cwd) === "centralperk-frontend" ? cwd : path.join(cwd, "centralperk-frontend");
}

function parseImageDataUrl(dataUrl: string, fallbackContentType: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload.");

  const contentType = String(match[1] || fallbackContentType || "").toLowerCase();
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!extension) throw new Error("Only JPG, PNG, or WebP profile photos are supported.");

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength <= 0) throw new Error("Profile photo is empty.");
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Profile photo must be 5MB or smaller.");

  return { buffer, extension };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const memberIdentifier = safeSegment(String(body.memberIdentifier || ""));
    const contentType = String(body.contentType || "").toLowerCase();
    const dataUrl = String(body.dataUrl || "");
    const { buffer, extension } = parseImageDataUrl(dataUrl, contentType);

    const publicDir = path.join(resolveFrontendRoot(), "public");
    const uploadDir = path.join(publicDir, "uploads", "profile-photos", memberIdentifier);
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const targetPath = path.resolve(uploadDir, fileName);
    const safeRoot = `${path.resolve(uploadDir)}${path.sep}`;
    if (!targetPath.startsWith(safeRoot)) throw new Error("Invalid upload path.");

    await writeFile(targetPath, buffer);

    return res.status(200).json({
      ok: true,
      publicUrl: `/uploads/profile-photos/${memberIdentifier}/${fileName}`,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save profile photo.",
    });
  }
}
