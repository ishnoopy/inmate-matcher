import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export type SavedUpload = {
  documentId: string;
  filename: string;
  absolutePath: string;
  relativePath: string;
};

function safeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export async function saveUploadedPdfToDisk(file: File) {
  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const originalName = safeFilename(file.name || "upload.pdf");
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const documentId = crypto.randomUUID();

  const storedName = `${documentId}${ext === ".pdf" ? ".pdf" : ext}`;
  const absolutePath = path.join(uploadsDir, storedName);
  const relativePath = path.join("data", "uploads", storedName).replaceAll("\\", "/");

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absolutePath, buf);

  return {
    documentId,
    filename: originalName,
    absolutePath,
    relativePath,
  };
}
