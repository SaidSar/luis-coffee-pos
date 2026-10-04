import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Sube un buffer de imagen y devuelve la URL segura
export const uploadImage = (buffer: Buffer, folder: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result!.secure_url))
    );
    stream.end(buffer);
  });

// Extrae el public_id de la URL de Cloudinary y elimina la imagen
export const deleteImage = async (url: string) => {
  const match = url.match(/\/upload\/v\d+\/(.+)\.\w+$/);
  if (match?.[1]) await cloudinary.uploader.destroy(match[1]);
};