export interface OcrResult {
  yellowTagFound: boolean;
  yellowTagText: string;
  tagLocation: string;
  suggestedFilename: string;
  documentCategory: string;
  summary: string;
  fullDocumentOcr: string;
  confidence: number;
}

export interface DocumentItem {
  id: string;
  file: File;
  originalName: string;
  normalizedDataUrl: string;
  normalizedBlob: Blob;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  
  // OCR & Tag Renaming state
  ocrStatus: 'idle' | 'analyzing' | 'success' | 'error';
  ocrProgress?: number;
  ocrProgressMsg?: string;
  ocrEngineUsed?: 'gemini' | 'local';
  ocrError?: string;
  ocrResult?: OcrResult;
  userCustomFilename: string; // The active filename user can edit
  
  // PDF state
  pdfStatus: 'idle' | 'converting' | 'ready' | 'error';
  pdfBlob?: Blob;
  pdfBytes?: Uint8Array;
  pdfSize?: number;
  pdfUrl?: string; // object URL for preview/download
  
  // Google Drive upload state
  driveStatus: 'idle' | 'uploading' | 'uploaded' | 'error';
  driveError?: string;
  driveFileId?: string;
  driveFileLink?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  uploadedAt?: string;
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
}

export interface DriveUserProfile {
  email: string;
  displayName: string;
  photoUrl?: string;
}
