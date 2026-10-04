import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ScannedProduct {
  name:     string;
  price:    number;
  category: string;
  extras:   string[];
}

export const scanMenuImage = async (
  buffer:   Buffer,
  mimeType: string
): Promise<ScannedProduct[]> => {
  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type:   'image',
          source: {
            type:       'base64',
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
            data:        buffer.toString('base64'),
          },
        },
        {
          type: 'text',
          text: `Analiza este menú y devuelve SOLO un array JSON válido.
Sin texto extra, sin backticks, sin explicaciones.

Formato exacto:
[{"name":"Nombre","price":0.00,"category":"Categoría","extras":["extra1"]}]

Reglas:
- "price" es número (no string). Si no hay precio, usa 0.
- "extras" puede ser [] vacío.
- "category" usa: Bebidas, Platillos, Postres, Entradas, Snacks u otra apropiada.
- Extrae TODOS los platillos visibles.`,
        },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
};