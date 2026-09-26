import { PDFDocument } from 'pdf-lib';
import heic2any from 'heic2any';

export interface ConvertedImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Normalizes input files (JPG, PNG, HEIC/HEIF) into standard displayable and embeddable JPEG/PNG.
 * Specifically converts iOS HEIC/HEIF files to high quality JPEG.
 */
export async function normalizeImage(file: File): Promise<ConvertedImageResult> {
  let processedBlob: Blob = file;
  const isHeic = 
    file.name.toLowerCase().endsWith('.heic') || 
    file.name.toLowerCase().endsWith('.heif') || 
    file.type === 'image/heic' || 
    file.type === 'image/heif';

  if (isHeic) {
    try {
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.92
      });
      processedBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch (err) {
      console.warn('heic2any conversion fallback or error:', err);
      // Fallback: keep original blob, or attempt to read
      processedBlob = file;
    }
  }

  const dataUrl = await blobToDataUrl(processedBlob);
  const { width, height } = await getImageDimensions(dataUrl);

  return {
    blob: processedBlob,
    dataUrl,
    width,
    height,
    mimeType: isHeic ? 'image/jpeg' : (processedBlob.type || 'image/jpeg')
  };
}

/**
 * Rotates an image blob by given degrees (90, -90, 180, 270) using an HTML5 Canvas.
 * Produces a pristine rotated JPEG Blob, dataUrl, and dimensions.
 */
export async function rotateImage(
  blob: Blob,
  degrees: number
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const dataUrl = await blobToDataUrl(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for rotation'));
    img.src = dataUrl;
  });

  // Normalize degrees to 0, 90, 180, or 270
  let normalizedDeg = degrees % 360;
  if (normalizedDeg < 0) normalizedDeg += 360;

  const is90or270 = normalizedDeg === 90 || normalizedDeg === 270;
  const originalWidth = img.naturalWidth || 800;
  const originalHeight = img.naturalHeight || 600;

  const targetWidth = is90or270 ? originalHeight : originalWidth;
  const targetHeight = is90or270 ? originalWidth : originalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Move origin to center of target canvas
  ctx.translate(targetWidth / 2, targetHeight / 2);
  ctx.rotate((normalizedDeg * Math.PI) / 180);
  ctx.drawImage(img, -originalWidth / 2, -originalHeight / 2);

  const rotatedBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/jpeg',
      0.95
    );
  });

  const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.95);

  return {
    blob: rotatedBlob,
    dataUrl: rotatedDataUrl,
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * Safely embeds any image into a PDFDocument, falling back to canvas re-encoding if needed
 */
async function embedImageSafely(pdfDoc: PDFDocument, imageBlob: Blob) {
  const imageBytes = await imageBlob.arrayBuffer();
  const isPng = imageBlob.type === 'image/png';

  try {
    if (isPng) {
      return await pdfDoc.embedPng(imageBytes);
    } else {
      return await pdfDoc.embedJpg(imageBytes);
    }
  } catch {
    try {
      return await pdfDoc.embedJpg(imageBytes);
    } catch {
      try {
        return await pdfDoc.embedPng(imageBytes);
      } catch {
        // Canvas re-encoding fallback
        const dataUrl = await blobToDataUrl(imageBlob);
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = dataUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 600;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);

        const safeBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
        if (!safeBlob) throw new Error('Could not convert image to JPEG');
        const safeBytes = await safeBlob.arrayBuffer();
        return await pdfDoc.embedJpg(safeBytes);
      }
    }
  }
}

/**
 * Converts a single image (JPG or converted HEIC) into a standard searchable-ready PDF file.
 * Preserves high resolution and scales to appropriate page margins.
 */
export async function convertImageToPdf(
  imageBlob: Blob, 
  title?: string,
  ocrMetadata?: {
    tagText?: string;
    category?: string;
    summary?: string;
  }
): Promise<{ pdfBlob: Blob; pdfBytes: Uint8Array; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();

  // Set standard PDF document metadata
  if (title) {
    pdfDoc.setTitle(title);
  }
  if (ocrMetadata?.tagText) {
    pdfDoc.setSubject(`Yellow Tag: ${ocrMetadata.tagText}`);
    pdfDoc.setKeywords(['DocTag OCR', ocrMetadata.category || 'Organized', ocrMetadata.tagText]);
  }
  pdfDoc.setProducer('DocTag OCR Document System');
  pdfDoc.setCreator('DocTag OCR');

  const embeddedImage = await embedImageSafely(pdfDoc, imageBlob);

  // Create page with exact matching image dimensions
  // Standard 72 DPI points based on pixel dimensions
  const imgWidth = embeddedImage.width;
  const imgHeight = embeddedImage.height;

  const page = pdfDoc.addPage([imgWidth, imgHeight]);

  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: imgWidth,
    height: imgHeight,
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  return {
    pdfBlob,
    pdfBytes,
    pageCount: 1
  };
}

/**
 * Combines multiple images into a multi-page PDF document
 */
export async function convertMultipleImagesToPdf(
  imageBlobs: Blob[],
  title?: string
): Promise<{ pdfBlob: Blob; pdfBytes: Uint8Array; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  if (title) pdfDoc.setTitle(title);

  for (const blob of imageBlobs) {
    const embeddedImage = await embedImageSafely(pdfDoc, blob);

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  return {
    pdfBlob,
    pdfBytes,
    pageCount: imageBlobs.length
  };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 1100 });
    };
    img.onerror = () => {
      resolve({ width: 800, height: 1100 });
    };
    img.src = dataUrl;
  });
}

/**
 * Format bytes to readable string (e.g. 2.4 MB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
