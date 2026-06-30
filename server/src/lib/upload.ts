import fs from "fs";
import path from "path";
import multer from "multer";
import { env } from "../config/env";
import { dirs } from "./storage";

function diskStorage(dest: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  });
}

// Document uploads — validates extension against the allow-list.
export const documentUpload = multer({
  storage: diskStorage(dirs.originals),
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (env.allowedExtensions.includes(ext)) cb(null, true);
    else cb(new Error(`File type .${ext} is not allowed`));
  },
});

const imageOnly = (dest: string) =>
  multer({
    storage: diskStorage(dest),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, /\.(png|jpe?g)$/i.test(file.originalname));
    },
  });

export const stampUpload = imageOnly(dirs.stamps);
export const signatureUpload = imageOnly(dirs.signatures);
export const profileThumbUpload = imageOnly(dirs.profiles);
