import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware for large payload (images in base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Please configure it in your secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString()
  });
});

/**
 * OCR endpoint: Specifically analyzes document scans / images to detect yellow sticky notes,
 * yellow labels, yellow tags, highlighter strips, or document stamps/tags, extracts text,
 * and suggests an optimized standardized filename.
 */
app.post('/api/ocr-tag', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', originalFilename = 'document.jpg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 field' });
    }

    const ai = getGeminiClient();

    // Clean base64 if it has data URL prefix
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const prompt = `
You are an expert document indexing, OCR, and archival system.
Analyze this document image carefully. 
The user specifically uses a YELLOW TAG / YELLOW STICKY NOTE / YELLOW LABEL / YELLOW INDEX TAB on documents to denote how the file should be named, indexed, and categorized for storage.

Task:
1. Locate any yellow tag, yellow sticky note, yellow label, yellow sticker, or yellow marker/highlighted area in the image.
2. Read and transcribe ALL text written or printed on or immediately inside that yellow tag/label.
3. If no distinct yellow tag is found, fallback to the prominent title, document header, reference number, or invoice/record ID at the top of the page.
4. Generate a clean, descriptive, filesystem-safe filename (WITHOUT extension).
   Rules for suggestedFilename:
   - Use the text found on the yellow tag as primary subject.
   - Clean out illegal characters like / \\ : * ? " < > |
   - Use spaces or hyphens/underscores cleanly, e.g. "Invoice-9821_Acme-Corp" or "Medical-Record_Smith-John" or "Property-Tax-2024_Lot44"
   - Include date or document reference if visible on the yellow tag.
   - Keep it concise but descriptive (typically 15-50 characters).
5. Extract all general OCR text from the entire document for searchability and metadata.
6. Provide a confidence score (0 to 1) for yellow tag detection, and explain where the yellow tag was located.
7. Suggest category / folder name recommendation (e.g., "Tax Records", "Receipts & Invoices", "Legal Documents", "Permits", "Correspondence", "General").

Return JSON with these exact fields:
{
  "yellowTagFound": boolean,
  "yellowTagText": string,
  "tagLocation": string,
  "suggestedFilename": string,
  "documentCategory": string,
  "summary": string,
  "fullDocumentOcr": string,
  "confidence": number
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType === 'image/heic' ? 'image/jpeg' : mimeType,
                data: cleanBase64
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            yellowTagFound: { type: Type.BOOLEAN, description: 'True if a yellow tag/sticker was found' },
            yellowTagText: { type: Type.STRING, description: 'The text extracted directly from the yellow tag' },
            tagLocation: { type: Type.STRING, description: 'Visual location of the yellow tag e.g. "top right corner"' },
            suggestedFilename: { type: Type.STRING, description: 'Standardized, safe filename without extension' },
            documentCategory: { type: Type.STRING, description: 'Category recommendation for folder storage' },
            summary: { type: Type.STRING, description: 'Brief 1-2 sentence summary of what the document is' },
            fullDocumentOcr: { type: Type.STRING, description: 'Complete transcribed text from the entire document' },
            confidence: { type: Type.NUMBER, description: 'Confidence between 0.0 and 1.0' }
          },
          required: [
            'yellowTagFound',
            'yellowTagText',
            'suggestedFilename',
            'documentCategory',
            'summary',
            'fullDocumentOcr',
            'confidence'
          ]
        }
      }
    });

    const responseText = response.text || '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      parsedData = {
        yellowTagFound: false,
        yellowTagText: '',
        suggestedFilename: originalFilename.replace(/\.[^/.]+$/, ''),
        documentCategory: 'Scanned Documents',
        summary: 'Document scanned successfully.',
        fullDocumentOcr: responseText,
        confidence: 0.5
      };
    }

    res.json({
      success: true,
      data: parsedData
    });
  } catch (err: any) {
    console.error('Error during OCR processing:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to process image OCR'
    });
  }
});

// In production or when Vite is mounted
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // In dev mode, mount Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
