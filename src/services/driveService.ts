import { GoogleDriveFolder } from '../types';

/**
 * Service to interact directly with the Google Drive API using client-side OAuth Bearer token
 * Scopes: drive.file, drive.metadata.readonly
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/**
 * List folders in Google Drive so the user can pick a specific destination folder
 */
export async function listDriveFolders(accessToken: string): Promise<GoogleDriveFolder[]> {
  try {
    const q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,iconLink)&pageSize=100&orderBy=name`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to fetch folders (${response.status})`);
    }

    const data = await response.json();
    return data.files || [];
  } catch (err: any) {
    console.error('listDriveFolders error:', err);
    throw err;
  }
}

/**
 * Create a new folder in Google Drive (or under a parent folder)
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<GoogleDriveFolder> {
  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentFolderId && parentFolderId !== 'root') {
    metadata.parents = [parentFolderId];
  }

  const response = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Failed to create folder (${response.status})`);
  }

  return response.json();
}

/**
 * Upload a PDF file to a specific Google Drive folder using multipart upload
 */
export async function uploadPdfToDrive(
  accessToken: string,
  pdfBlob: Blob,
  filename: string,
  folderId?: string,
  description?: string
): Promise<{ id: string; name: string; webViewLink?: string; size?: string }> {
  const cleanFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;

  const metadata: any = {
    name: cleanFilename,
    mimeType: 'application/pdf',
    description: description || 'Scanned and OCR organized document via DocTag OCR',
  };

  if (folderId && folderId !== 'root') {
    metadata.parents = [folderId];
  }

  // Create multipart boundary
  const boundary = '-------DocTagOCRBoundary' + Math.random().toString(36).substring(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const fileHeaderPart = `${delimiter}Content-Type: application/pdf\r\n\r\n`;

  // Combine metadata and PDF blob
  const multipartBody = new Blob(
    [
      metadataPart,
      fileHeaderPart,
      pdfBlob,
      closeDelimiter,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const uploadUrl = `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink,size`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Failed to upload PDF to Google Drive (${response.status})`);
  }

  const result = await response.json();
  return result;
}

/**
 * Fetch current user profile info from Google
 */
export async function fetchGoogleUserProfile(accessToken: string) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Could not fetch user profile:', e);
  }
  return null;
}

/**
 * Makes a Google Drive file publicly accessible (anyone with the link can view).
 */
export async function makeFilePublic(accessToken: string, fileId: string) {
  const url = `${DRIVE_API_BASE}/files/${fileId}/permissions`;
  
  const permission = {
    type: 'anyone',
    role: 'reader',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(permission),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Failed to make file public (${response.status})`);
  }

  return response.json();
}
