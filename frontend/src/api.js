export const getPresignedUrl = async () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) throw new Error("API URL no configurada en VITE_API_URL");
  
  const response = await fetch(`${apiUrl}/presigned-url`);
  if (!response.ok) {
    throw new Error("Error al obtener la URL de subida");
  }
  return response.json(); // { uploadUrl, imageId }
};

export const uploadImageToS3 = async (uploadUrl, blob) => {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: {
      "Content-Type": "image/jpeg",
    },
  });
  if (!response.ok) {
    throw new Error("Error al subir la imagen");
  }
};

export const analyzeImage = async (imageId) => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const response = await fetch(`${apiUrl}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageId }),
  });
  
  if (!response.ok) {
    throw new Error("Error procesando la imagen");
  }
  
  return response.json(); // { name, rarity, set, price, imageUrl }
};
