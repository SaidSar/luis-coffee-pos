import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Modelo configurable con GEMINI_MODEL; se lee en cada llamada para no depender del orden de carga de .env
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

// Códigos de error que el controlador traduce a HTTP
export const AI_SERVICE_UNAVAILABLE = 'AI_SERVICE_UNAVAILABLE'; // Gemini caído o la llamada falló → 503
export const AI_INVALID_RESPONSE    = 'AI_INVALID_RESPONSE';    // respuesta vacía o JSON inválido → 502

export const scanMenuImage = async (imageBase64: string, mimeType: string = 'image/jpeg') => {
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  const prompt = `Analiza la imagen de este menú de cafetería. Extrae todos los platillos y bebidas que encuentres con sus precios y categorías aproximadas. 
    Devuelve la respuesta estrictamente en formato JSON con esta estructura exacta:
    {
      "items": [
        {
          "name": "Nombre del producto",
          "price": 0.00,
          "category": "Bebidas o Comida",
          "description": "Breve descripción si la hay"
        }
      ]
    }`;

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: imageBase64, mimeType: mimeType } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
      }
    });
  } catch (error: unknown) {
    console.error(`[gemini] Falló la llamada a ${model}:`, error instanceof Error ? error.message : error);
    throw new Error(AI_SERVICE_UNAVAILABLE);
  }

  const textResponse = response.text;
  if (!textResponse) {
    console.error('[gemini] Respuesta vacía');
    throw new Error(AI_INVALID_RESPONSE);
  }

  try {
    return JSON.parse(textResponse);
  } catch (error: unknown) {
    console.error('[gemini] La respuesta no es JSON válido:', error instanceof Error ? error.message : error);
    throw new Error(AI_INVALID_RESPONSE);
  }
};