import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI();

export const scanMenuImage = async (imageBase64: string, mimeType: string = 'image/jpeg') => {
  try {
    const prompt = `Analiza la imagen de este menú de cafetería. Extrae todos los platillos y bebidas que encuentres con sus precios y categorías aproximadas. 
    Devuelve la respuesta estrictamente en formato JSON plano con esta estructura exacta, sin texto adicional ni bloques de código markdown:
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

    // Usamos estrictamente el modelo que el SDK y la API exigen
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: imageBase64, mimeType: mimeType } },
            { text: prompt }
          ]
        }
      ],
    });

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error('No se recibió respuesta de Gemini');
    }

    const cleanJson = textResponse
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    return JSON.parse(cleanJson);

  } catch (error: any) {
    console.error('>>> [AVISO] El escaneo por IA no está disponible temporalmente:', error.message || error);
    throw new Error('AI_SERVICE_UNAVAILABLE');
  }
};