import { OcrResult } from '../types';

/**
 * Downscales an image data URL for ultra-fast network transmission to the OCR engine.
 * The original pristine high-res file is preserved for the PDF itself.
 * Downscaling to ~1200px cuts transfer payload by 95-98% (from 15MB down to ~150KB).
 */
export async function getOcrOptimizedDataUrl(dataUrl: string, maxDim = 1200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 800;
      const height = img.naturalHeight || 600;
      if (width <= maxDim && height <= maxDim) {
        return resolve(dataUrl);
      }
      let targetW = width;
      let targetH = height;
      if (targetW > targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Calls the backend Gemini OCR endpoint to inspect document scans,
 * pinpoint yellow tags, notes, or labels, extract text, and compute an intelligent filename.
 */
export async function analyzeYellowTagOCR(
  imageBase64: string,
  mimeType: string,
  originalFilename: string
): Promise<OcrResult> {
  // Compress/downscale OCR transmission payload so network upload takes milliseconds
  const optimizedDataUrl = await getOcrOptimizedDataUrl(imageBase64, 1200);

  const response = await fetch('/api/ocr-tag', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64: optimizedDataUrl,
      mimeType: 'image/jpeg',
      originalFilename,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server OCR request failed (${response.status})`);
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to analyze yellow tag OCR');
  }

  return result.data as OcrResult;
}
