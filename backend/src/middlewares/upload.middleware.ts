import multer from 'multer';

export const upload = multer({
  storage: multer.memoryStorage(),          // en memoria → lo sube Cloudinary
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB máx
  fileFilter: (_, file, cb) => {
    file.mimetype.startsWith('image/')
      ? cb(null, true)
      : cb(new Error('Solo se permiten imágenes'));
  },
});