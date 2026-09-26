import { OcrResult } from '../types';

interface YellowRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/**
 * Scans an image canvas to identify yellow regions (sticky notes, yellow tags, labels).
 * Yellow has high Red, high Green, and low/moderate Blue:
 * R > 150, G > 140, B < 150, and (R + G) / (2 * B) > 1.4
 */
export function detectYellowTagRegion(
  img: HTMLImageElement,
  canvasWidth = 600,
  canvasHeight = 800
): { region: YellowRegion | null; locationDescription: string } {
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { region: null, locationDescription: 'Unknown' };

  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const data = imageData.data;

  // Grid scan to find density clusters of yellow pixels
  const step = 8;
  const gridW = Math.floor(canvasWidth / step);
  const gridH = Math.floor(canvasHeight / step);
  const density = new Int32Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const px = gx * step;
      const py = gy * step;
      const idx = (py * canvasWidth + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Yellow color check in RGB space:
      // High Red and Green, notably lower Blue, with vibrant saturation
      const isYellow = r > 140 && g > 130 && b < 140 && (r + g) > 300 && (r - b > 40) && (g - b > 35);
      if (isYellow) {
        density[gy * gridW + gx] = 1;
      }
    }
  }

  // Find bounding box around largest cluster of yellow
  let minGx = gridW, maxGx = 0, minGy = gridH, maxGy = 0;
  let totalYellowBlocks = 0;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (density[gy * gridW + gx] === 1) {
        totalYellowBlocks++;
        if (gx < minGx) minGx = gx;
        if (gx > maxGx) maxGx = gx;
        if (gy < minGy) minGy = gy;
        if (gy > maxGy) maxGy = gy;
      }
    }
  }

  // Threshold: at least ~20 sample blocks (~1280 pixels) to avoid noise
  if (totalYellowBlocks > 20 && maxGx >= minGx && maxGy >= minGy) {
    const rx = Math.max(0, (minGx * step) - 10);
    const ry = Math.max(0, (minGy * step) - 10);
    const rw = Math.min(canvasWidth - rx, ((maxGx - minGx + 1) * step) + 20);
    const rh = Math.min(canvasHeight - ry, ((maxGy - minGy + 1) * step) + 20);

    const centerX = rx + rw / 2;
    const centerY = ry + rh / 2;

    let horiz = 'center';
    if (centerX < canvasWidth * 0.35) horiz = 'left';
    else if (centerX > canvasWidth * 0.65) horiz = 'right';

    let vert = 'middle';
    if (centerY < canvasHeight * 0.35) vert = 'top';
    else if (centerY > canvasHeight * 0.65) vert = 'bottom';

    const locationDescription = `${vert} ${horiz}`;

    return {
      region: {
        x: rx / canvasWidth,
        y: ry / canvasHeight,
        width: rw / canvasWidth,
        height: rh / canvasHeight,
        score: Math.min(1.0, totalYellowBlocks / 200),
      },
      locationDescription,
    };
  }

  return { region: null, locationDescription: 'Not detected' };
}

/**
 * Helper to run a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });
}

/**
 * Creates a downscaled JPEG data URL to keep OCR blazing fast and memory-efficient
 */
function downscaleImage(img: HTMLImageElement, maxDim = 1200): string {
  const width = img.naturalWidth || 800;
  const height = img.naturalHeight || 600;
  let targetW = width;
  let targetH = height;

  if (targetW > maxDim || targetH > maxDim) {
    if (targetW > targetH) {
      targetH = Math.round((targetH * maxDim) / targetW);
      targetW = maxDim;
    } else {
      targetW = Math.round((targetW * maxDim) / targetH);
      targetH = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
  return img.src;
}

/**
 * Runs 100% in-browser client-side OCR using Tesseract.js (no API keys, zero network fees).
 * Analyzes the yellow tag region specifically with timeout and memory protections.
 */
export async function runLocalClientOCR(
  imageDataUrl: string,
  originalFilename: string,
  onProgress?: (progress: number, status: string) => void
): Promise<OcrResult> {
  const fallbackBase = originalFilename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    // Load image into an HTMLImageElement for yellow tag bounding analysis
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageDataUrl;
    });

    const { region, locationDescription } = detectYellowTagRegion(img);

    // If a yellow region is found, crop specifically to that area
    let croppedTagDataUrl: string | null = null;
    if (region) {
      try {
        const cropCanvas = document.createElement('canvas');
        const sx = Math.floor(region.x * (img.naturalWidth || 800));
        const sy = Math.floor(region.y * (img.naturalHeight || 600));
        const sw = Math.floor(region.width * (img.naturalWidth || 800));
        const sh = Math.floor(region.height * (img.naturalHeight || 600));

        cropCanvas.width = sw;
        cropCanvas.height = sh;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx && sw > 10 && sh > 10) {
          cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          croppedTagDataUrl = cropCanvas.toDataURL('image/jpeg', 0.9);
        }
      } catch (e) {
        console.warn('Tag crop error:', e);
      }
    }

    onProgress?.(25, 'Initializing local OCR...');
    const Tesseract = await import('tesseract.js');

    let yellowTagText = '';
    let fullText = '';

    // Step 1: Fast priority OCR on cropped yellow tag (if found)
    if (croppedTagDataUrl) {
      onProgress?.(45, 'Scanning yellow tag text...');
      const tagPromise = Tesseract.recognize(croppedTagDataUrl, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            onProgress?.(45 + Math.floor((m.progress || 0) * 30), 'Reading yellow tag text...');
          }
        },
      });

      const tagResult = await withTimeout(tagPromise, 10000, null);
      if (tagResult?.data?.text) {
        yellowTagText = tagResult.data.text.trim();
      }
    }

    // Step 2: If tag text is still missing or empty, do a fast downscaled scan of the document
    if (!yellowTagText || yellowTagText.length < 2) {
      onProgress?.(70, 'Scanning header for labels...');
      const downscaledUrl = downscaleImage(img, 1000);
      const fullPromise = Tesseract.recognize(downscaledUrl, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            onProgress?.(70 + Math.floor((m.progress || 0) * 25), 'Scanning labels...');
          }
        },
      });

      const fullResult = await withTimeout(fullPromise, 12000, null);
      if (fullResult?.data?.text) {
        fullText = fullResult.data.text.trim();
        const lines = fullText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length >= 2 && !/^[^a-zA-Z0-9]+$/.test(l));

        if (lines.length > 0) {
          yellowTagText = lines[0];
        }
      }
    }

    // Clean tag text
    const cleanTag = yellowTagText
      .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 45);

    const hasValidTag = Boolean(cleanTag && cleanTag.length >= 2);
    const suggestedFilename = hasValidTag ? cleanTag : fallbackBase;

    onProgress?.(100, 'Done');

    return {
      yellowTagFound: hasValidTag,
      yellowTagText: cleanTag || (region ? 'Tag detected' : ''),
      tagLocation: locationDescription,
      suggestedFilename,
      documentCategory: 'Scanned Document (Local OCR)',
      summary: hasValidTag
        ? `Yellow tag text: "${cleanTag}"`
        : 'Scanned document processed.',
      fullDocumentOcr: fullText || yellowTagText || 'Processed locally.',
      confidence: hasValidTag ? 0.85 : 0.5,
    };
  } catch (err) {
    console.warn('Local OCR caught error, using safe fallback:', err);
    return {
      yellowTagFound: false,
      yellowTagText: '',
      tagLocation: 'Not detected',
      suggestedFilename: fallbackBase,
      documentCategory: 'Scanned Document',
      summary: 'Document scanned (OCR fallback).',
      fullDocumentOcr: '',
      confidence: 0.5,
    };
  }
}
