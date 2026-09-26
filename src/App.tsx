import React, { useState, useEffect } from 'react';
import { DocumentItem, GoogleDriveFolder } from './types';
import { normalizeImage, convertImageToPdf, convertMultipleImagesToPdf, rotateImage } from './utils/pdfConverter';
import { analyzeYellowTagOCR } from './services/ocrService';
import { runLocalClientOCR } from './services/localOcrService';
import {
  listDriveFolders,
  createDriveFolder,
  uploadPdfToDrive,
  fetchGoogleUserProfile,
  makeFilePublic,
} from './services/driveService';
import {
  subscribeAuth,
  getCachedToken,
  clearAuth,
  setAccessToken,
} from './services/authService';
import { FileUploader } from './components/FileUploader';
import { DocumentCard } from './components/DocumentCard';
import { FolderSelector } from './components/FolderSelector';
import { DriveAuthBar } from './components/DriveAuthBar';
import {
  FileText,
  Upload,
  Sparkles,
  CheckCircle2,
  FolderArchive,
  Layers,
  ArrowRight,
  Zap,
  Info,
  ShieldCheck,
  Tag,
  Download,
  Check,
  AlertTriangle,
  Archive,
  Files,
  RotateCw,
  RotateCcw,
  RefreshCw,
  Trash2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import JSZip from 'jszip';

export default function App() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('root');
  const [selectedFolderName, setSelectedFolderName] = useState<string>('My Drive (Root)');
  const [isLoadingFolders, setIsLoadingFolders] = useState<boolean>(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<{ email?: string; name?: string; picture?: string } | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [showKeyGuideModal, setShowKeyGuideModal] = useState<boolean>(false);
  const [preferredEngine, setPreferredEngine] = useState<'auto' | 'local' | 'gemini'>('auto');

  // Confirmation modal (replaces window.confirm)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmDetails, setConfirmDetails] = useState<{
    title: string;
    subtitle?: string;
    message: string;
    confirmButtonText?: string;
    confirmButtonVariant?: 'primary' | 'danger';
    iconType?: 'upload' | 'trash';
    count: number;
  }>({
    title: '',
    message: '',
    count: 0,
  });

  useEffect(() => {
    // Check server Gemini API key status
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHasApiKey(Boolean(data.hasApiKey)))
      .catch(() => setHasApiKey(false));

    const unsubscribe = subscribeAuth((state) => {
      setIsAuthenticated(state.isAuthenticated);
      setUserProfile(state.user);

      if (state.isAuthenticated && state.accessToken) {
        loadDriveFolders(state.accessToken);
        fetchGoogleUserProfile(state.accessToken).then((profile) => {
          if (profile) {
            setUserProfile({
              email: profile.email,
              name: profile.name,
              picture: profile.picture,
            });
          }
        });
      } else {
        setFolders([]);
      }
    });

    // Check if token exists in memory
    const existing = getCachedToken();
    if (existing) {
      setIsAuthenticated(true);
      loadDriveFolders(existing);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowKeyGuideModal(false);
        setConfirmModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification((current) => (current?.text === text ? null : current));
    }, 4500);
  };

  const loadDriveFolders = async (token: string) => {
    setIsLoadingFolders(true);
    try {
      const folderList = await listDriveFolders(token);
      setFolders(folderList);
    } catch (err: any) {
      console.error('Failed to load folders:', err);
      showToast(`Could not load folders: ${err.message}`, 'error');
    } finally {
      setIsLoadingFolders(false);
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    const token = getCachedToken();
    if (!token) {
      showToast('Connect Google Drive to create folders', 'error');
      return;
    }
    try {
      const newFolder = await createDriveFolder(
        token,
        folderName,
        selectedFolderId === 'root' ? undefined : selectedFolderId
      );
      setFolders((prev) => [newFolder, ...prev]);
      setSelectedFolderId(newFolder.id);
      setSelectedFolderName(newFolder.name);
      showToast(`Folder "${newFolder.name}" created and selected!`, 'success');
    } catch (err: any) {
      showToast(`Error creating folder: ${err.message}`, 'error');
    }
  };

  /**
   * Process added files:
   * 1. Normalize (HEIC -> JPG, JPG load)
   * 2. Automatically trigger Gemini yellow-tag OCR
   * 3. Simultaneously convert to PDF
   */
  const handleFilesSelected = async (files: File[]) => {
    const newItems: DocumentItem[] = [];

    for (const file of files) {
      const id = 'doc_' + Math.random().toString(36).substring(2, 11);
      try {
        const normalized = await normalizeImage(file);
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const initializedName = baseName.startsWith('Yiddish') ? baseName : `Yiddish_${baseName}`;

        const item: DocumentItem = {
          id,
          file,
          originalName: file.name,
          normalizedDataUrl: normalized.dataUrl,
          normalizedBlob: normalized.blob,
          mimeType: normalized.mimeType,
          fileSize: file.size,
          width: normalized.width,
          height: normalized.height,
          ocrStatus: 'analyzing',
          userCustomFilename: initializedName,
          pdfStatus: 'converting',
          driveStatus: 'idle',
        };

        newItems.push(item);
      } catch (err: any) {
        console.error('Error normalizing file:', file.name, err);
        showToast(`Could not process ${file.name}: ${err.message}`, 'error');
      }
    }

    if (newItems.length === 0) return;

    setDocuments((prev) => [...prev, ...newItems]);
    showToast(`Added ${newItems.length} document(s). Analyzing yellow tags & generating PDFs...`, 'info');

    // Concurrently process documents (pool of 2 parallel workers) for 2x faster throughput
    (async () => {
      const concurrency = Math.min(2, newItems.length);
      const queue = [...newItems];
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await processDocumentPipeline(item);
          }
        }
      });
      await Promise.all(workers);
    })();
  };

  const processDocumentPipeline = async (item: DocumentItem) => {
    // Determine whether to use Gemini Vision or 100% In-Browser Local OCR
    const shouldUseLocal = preferredEngine === 'local' || (!hasApiKey && preferredEngine !== 'gemini');

    let ocrResult: any = null;
    let engineUsed: 'gemini' | 'local' = shouldUseLocal ? 'local' : 'gemini';

    try {
      if (shouldUseLocal) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === item.id
              ? {
                  ...d,
                  ocrStatus: 'analyzing',
                  ocrProgress: 15,
                  ocrProgressMsg: 'Running in-browser local OCR (No API key needed)...',
                  ocrEngineUsed: 'local',
                }
              : d
          )
        );

        ocrResult = await runLocalClientOCR(
          item.normalizedDataUrl,
          item.originalName,
          (progress, status) => {
            setDocuments((prev) =>
              prev.map((d) =>
                d.id === item.id ? { ...d, ocrProgress: progress, ocrProgressMsg: status } : d
              )
            );
          }
        );
      } else {
        // Try Gemini Vision OCR
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === item.id
              ? {
                  ...d,
                  ocrStatus: 'analyzing',
                  ocrProgressMsg: 'Scanning with Gemini Vision AI...',
                  ocrEngineUsed: 'gemini',
                }
              : d
          )
        );

        try {
          ocrResult = await analyzeYellowTagOCR(
            item.normalizedDataUrl,
            item.mimeType,
            item.originalName
          );
        } catch (geminiErr: any) {
          console.warn('Gemini OCR unavailable or failed, switching automatically to local OCR:', geminiErr);
          // Seamless fallback to offline local OCR engine!
          engineUsed = 'local';
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === item.id
                ? {
                    ...d,
                    ocrProgress: 20,
                    ocrProgressMsg: 'Switching to local offline OCR...',
                    ocrEngineUsed: 'local',
                  }
                : d
            )
          );

          ocrResult = await runLocalClientOCR(
            item.normalizedDataUrl,
            item.originalName,
            (progress, status) => {
              setDocuments((prev) =>
                prev.map((d) =>
                  d.id === item.id ? { ...d, ocrProgress: progress, ocrProgressMsg: status } : d
                )
              );
            }
          );
        }
      }

      let computedFilename = 'Yiddish';
      if (ocrResult && ocrResult.yellowTagFound && ocrResult.yellowTagText && ocrResult.yellowTagText.trim().length >= 2) {
        const cleanTag = ocrResult.yellowTagText
          .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
          .replace(/\s+/g, '_')
          .replace(/^_+|_+$/g, '');
        computedFilename = cleanTag.startsWith('Yiddish') ? cleanTag : `Yiddish_${cleanTag}`;
      } else if (ocrResult && ocrResult.suggestedFilename && ocrResult.suggestedFilename !== 'Yiddish') {
        const cleanSuggested = ocrResult.suggestedFilename
          .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
          .replace(/\s+/g, '_')
          .replace(/^_+|_+$/g, '');
        computedFilename = cleanSuggested.startsWith('Yiddish') ? cleanSuggested : `Yiddish_${cleanSuggested}`;
      } else {
        computedFilename = 'Yiddish';
      }

      // 2. Generate PDF with metadata
      const { pdfBlob, pdfBytes } = await convertImageToPdf(
        item.normalizedBlob,
        computedFilename,
        {
          tagText: ocrResult.yellowTagText,
          category: ocrResult.documentCategory,
          summary: ocrResult.summary,
        }
      );

      const pdfUrl = URL.createObjectURL(pdfBlob);

      setDocuments((prev) => {
        let finalFilename = computedFilename;
        let counter = 1;
        while (prev.some((d) => d.userCustomFilename === finalFilename && d.id !== item.id && d.pdfStatus === 'ready')) {
          finalFilename = `${computedFilename}_${counter}`;
          counter++;
        }

        return prev.map((doc) => {
          if (doc.id !== item.id) return doc;
          if (doc.pdfUrl && doc.pdfUrl !== pdfUrl) {
            URL.revokeObjectURL(doc.pdfUrl);
          }
          return {
            ...doc,
            ocrStatus: 'success',
            ocrResult,
            ocrEngineUsed: engineUsed,
            userCustomFilename: finalFilename,
            pdfStatus: 'ready',
            pdfBlob,
            pdfBytes,
            pdfSize: pdfBlob.size,
            pdfUrl,
          };
        });
      });

      if (ocrResult?.yellowTagFound && ocrResult?.yellowTagText) {
        showToast(`Found yellow tag: "${ocrResult.yellowTagText}" → ${computedFilename}.pdf`, 'success');
      }
    } catch (err: any) {
      console.error('Pipeline error for doc:', item.id, err);
      // Fallback: convert PDF without OCR metadata if OCR failed
      try {
        const fallbackBase = item.userCustomFilename.startsWith('Yiddish')
          ? item.userCustomFilename
          : `Yiddish_${item.userCustomFilename}`;

        const { pdfBlob, pdfBytes } = await convertImageToPdf(item.normalizedBlob, fallbackBase);
        const pdfUrl = URL.createObjectURL(pdfBlob);

        setDocuments((prev) => {
          let finalFilename = fallbackBase;
          let counter = 1;
          while (prev.some((d) => d.userCustomFilename === finalFilename && d.id !== item.id && d.pdfStatus === 'ready')) {
            finalFilename = `${fallbackBase}_${counter}`;
            counter++;
          }

          return prev.map((doc) => {
            if (doc.id !== item.id) return doc;
            return {
              ...doc,
              ocrStatus: 'error',
              ocrError: err.message || 'Tag not recognized (defaulting to Yiddish)',
              userCustomFilename: finalFilename,
              pdfStatus: 'ready',
              pdfBlob,
              pdfBytes,
              pdfSize: pdfBlob.size,
              pdfUrl,
            };
          });
        });
      } catch (pdfErr: any) {
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === item.id
              ? { ...doc, ocrStatus: 'error', ocrError: err.message, pdfStatus: 'error' }
              : doc
          )
        );
      }
    }
  };

  const handleUpdateFilename = (id: string, newName: string) => {
    let clean = newName.trim().replace(/\.pdf$/i, '').replace(/[/\\?%*:|"<>]/g, '-');
    if (!clean) clean = 'Yiddish';

    // Ensure it starts with Yiddish
    if (!clean.startsWith('Yiddish')) {
      clean = `Yiddish_${clean}`;
    }

    setDocuments((prev) => {
      let finalName = clean;
      let counter = 1;
      // Automatically check for duplicates among other documents
      while (prev.some((d) => d.id !== id && d.userCustomFilename === finalName)) {
        finalName = `${clean}_${counter}`;
        counter++;
      }

      if (finalName !== clean) {
        showToast(`Duplicate found — auto-numbered to "${finalName}"`, 'info');
      }

      return prev.map((doc) => (doc.id === id ? { ...doc, userCustomFilename: finalName } : doc));
    });
  };

  const handleRetryOcr = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ocrStatus: 'analyzing', ocrError: undefined } : d))
    );
    showToast(`Re-scanning "${doc.originalName}" in current orientation...`, 'info');
    processDocumentPipeline(doc);
  };

  const handleConvertToPdf = async (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;

    try {
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, pdfStatus: 'converting' } : d))
      );
      const { pdfBlob, pdfBytes } = await convertImageToPdf(doc.normalizedBlob, doc.userCustomFilename);
      const pdfUrl = URL.createObjectURL(pdfBlob);
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, pdfStatus: 'ready', pdfBlob, pdfBytes, pdfSize: pdfBlob.size, pdfUrl }
            : d
        )
      );
      showToast('PDF generated successfully!', 'success');
    } catch (err: any) {
      showToast(`Failed to generate PDF: ${err.message}`, 'error');
    }
  };

  const handleRotateDocument = async (id: string, degrees: number) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;

    try {
      showToast(degrees === 180 ? 'Flipping image 180°...' : degrees > 0 ? 'Rotating image 90° clockwise...' : 'Rotating image 90° counter-clockwise...', 'info');

      const rotated = await rotateImage(doc.normalizedBlob, degrees);

      // Clean up previous URL if any
      if (doc.pdfUrl) {
        URL.revokeObjectURL(doc.pdfUrl);
      }

      // Automatically regenerate upright PDF
      const { pdfBlob, pdfBytes } = await convertImageToPdf(rotated.blob, doc.userCustomFilename);
      const pdfUrl = URL.createObjectURL(pdfBlob);

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                normalizedBlob: rotated.blob,
                normalizedDataUrl: rotated.dataUrl,
                width: rotated.width,
                height: rotated.height,
                pdfStatus: 'ready',
                pdfBlob,
                pdfBytes,
                pdfSize: pdfBlob.size,
                pdfUrl,
              }
            : d
        )
      );

      showToast('Rotated upright! Click "Rescan Upright Image" to re-analyze tag.', 'success');
    } catch (err: any) {
      console.error('Rotation failed:', err);
      showToast(`Could not rotate image: ${err.message}`, 'error');
    }
  };

  const handleRotateAll = async (degrees: number) => {
    if (documents.length === 0) return;
    showToast(`Rotating all ${documents.length} document(s)...`, 'info');

    for (const doc of documents) {
      try {
        const rotated = await rotateImage(doc.normalizedBlob, degrees);
        if (doc.pdfUrl) {
          URL.revokeObjectURL(doc.pdfUrl);
        }
        const { pdfBlob, pdfBytes } = await convertImageToPdf(rotated.blob, doc.userCustomFilename);
        const pdfUrl = URL.createObjectURL(pdfBlob);

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? {
                  ...d,
                  normalizedBlob: rotated.blob,
                  normalizedDataUrl: rotated.dataUrl,
                  width: rotated.width,
                  height: rotated.height,
                  pdfStatus: 'ready',
                  pdfBlob,
                  pdfBytes,
                  pdfSize: pdfBlob.size,
                  pdfUrl,
                }
              : d
          )
        );
      } catch (e) {
        console.error('Batch rotate failed on doc:', doc.id, e);
      }
    }
    showToast('All documents rotated! Click "Rescan All" to re-read all tags upright.', 'success');
  };

  const handleRescanAll = async () => {
    if (documents.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    showToast(`Re-scanning all ${documents.length} document(s) in their current orientation...`, 'info');

    // Concurrently process documents (pool of 2 parallel workers)
    const queue = [...documents];
    const concurrency = Math.min(2, queue.length);
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          await processDocumentPipeline(item);
        }
      }
    });
    await Promise.all(workers);
    setIsBatchProcessing(false);
    showToast('Re-scan completed for all documents!', 'success');
  };

  const handleUploadSingleToDrive = async (id: string) => {
    const token = getCachedToken();
    if (!token) {
      showToast('Please connect Google Drive first', 'error');
      return;
    }

    const doc = documents.find((d) => d.id === id);
    if (!doc || !doc.pdfBlob) {
      showToast('Document PDF is not ready yet', 'error');
      return;
    }

    // Explicit confirmation dialog per Workspace instructions
    const confirmSave = () => {
      executeSingleDriveUpload(id, token, doc);
    };

    setConfirmDetails({
      title: 'Confirm Save to Google Drive',
      subtitle: 'Google Drive Workspace Upload',
      message: `Upload "${doc.userCustomFilename}.pdf" to folder "${selectedFolderName}" in your Google Drive?`,
      confirmButtonText: 'Confirm & Upload',
      confirmButtonVariant: 'primary',
      iconType: 'upload',
      count: 1,
    });
    setConfirmAction(() => confirmSave);
    setConfirmModalOpen(true);
  };

  const executeSingleDriveUpload = async (id: string, token: string, doc: DocumentItem) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, driveStatus: 'uploading', driveError: undefined } : d))
    );

    try {
      const description = doc.ocrResult?.yellowTagText
        ? `Yellow Tag Text: ${doc.ocrResult.yellowTagText} | Category: ${doc.ocrResult.documentCategory}`
        : 'DocTag OCR Converted Document';

      const uploadResult = await uploadPdfToDrive(
        token,
        doc.pdfBlob!,
        doc.userCustomFilename,
        selectedFolderId === 'root' ? undefined : selectedFolderId,
        description
      );

      // Automatically make file public
      await makeFilePublic(token, uploadResult.id);

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                driveStatus: 'uploaded',
                driveFileId: uploadResult.id,
                driveFileLink: uploadResult.webViewLink || `https://drive.google.com/file/d/${uploadResult.id}/view`,
                driveFolderId: selectedFolderId,
                driveFolderName: selectedFolderName,
                uploadedAt: new Date().toLocaleTimeString(),
              }
            : d
        )
      );

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
      });

      showToast(`Uploaded and shared "${doc.userCustomFilename}.pdf" publicly!`, 'success');
    } catch (err: any) {
      console.error('Upload error:', err);
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, driveStatus: 'error', driveError: err.message } : d
        )
      );
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  };

  const handleUploadAllToDrive = () => {
    const token = getCachedToken();
    if (!token) {
      showToast('Please connect Google Drive first', 'error');
      return;
    }

    const readyDocs = documents.filter((d) => d.pdfStatus === 'ready' && d.driveStatus !== 'uploaded');
    if (readyDocs.length === 0) {
      showToast('No pending PDFs ready to upload', 'info');
      return;
    }

    // Explicit confirmation dialog per Workspace instructions
    const confirmSaveAll = async () => {
      setIsBatchProcessing(true);
      let successCount = 0;

      for (const doc of readyDocs) {
        try {
          await executeSingleDriveUpload(doc.id, token, doc);
          successCount++;
        } catch {
          // continue loop
        }
      }

      setIsBatchProcessing(false);
      if (successCount > 0) {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.7 },
        });
        showToast(`Successfully uploaded ${successCount} PDF file(s) to "${selectedFolderName}"!`, 'success');
      }
    };

    setConfirmDetails({
      title: 'Confirm Bulk Upload to Google Drive',
      subtitle: 'Google Drive Workspace Upload',
      message: `Save ${readyDocs.length} PDF documents directly into "${selectedFolderName}"?`,
      confirmButtonText: `Confirm & Upload (${readyDocs.length})`,
      confirmButtonVariant: 'primary',
      iconType: 'upload',
      count: readyDocs.length,
    });
    setConfirmAction(() => confirmSaveAll);
    setConfirmModalOpen(true);
  };

  const handleDownloadAllZip = async () => {
    const readyDocs = documents.filter((d) => d.pdfBlob && d.pdfStatus === 'ready');
    if (readyDocs.length === 0) {
      showToast('No converted PDFs are ready to download yet', 'error');
      return;
    }

    try {
      showToast(`Packaging ${readyDocs.length} individual PDF(s) into a ZIP file...`, 'info');
      const zip = new JSZip();

      const usedNames = new Set<string>();
      for (const doc of readyDocs) {
        if (doc.pdfBlob) {
          let baseName = doc.userCustomFilename || 'Yiddish';
          let finalName = baseName;
          let counter = 1;
          while (usedNames.has(finalName.toLowerCase())) {
            finalName = `${baseName}_${counter}`;
            counter++;
          }
          usedNames.add(finalName.toLowerCase());
          zip.file(`${finalName}.pdf`, doc.pdfBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Yiddish_Individual_PDFs_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.8 },
      });
      showToast(`Downloaded ZIP containing ${readyDocs.length} individual PDF files!`, 'success');
    } catch (err: any) {
      console.error('Failed to create ZIP:', err);
      showToast(`Failed to create ZIP: ${err.message}`, 'error');
    }
  };

  const handleDownloadAllOneByOne = async () => {
    const readyDocs = documents.filter((d) => d.pdfBlob && d.pdfStatus === 'ready');
    if (readyDocs.length === 0) {
      showToast('No converted PDFs are ready to download yet', 'error');
      return;
    }

    showToast(`Downloading ${readyDocs.length} individual PDF files to your Downloads folder...`, 'info');
    const usedNames = new Set<string>();
    for (let i = 0; i < readyDocs.length; i++) {
      const doc = readyDocs[i];
      if (doc.pdfBlob) {
        let baseName = doc.userCustomFilename || 'Yiddish';
        let finalName = baseName;
        let counter = 1;
        while (usedNames.has(finalName.toLowerCase())) {
          finalName = `${baseName}_${counter}`;
          counter++;
        }
        usedNames.add(finalName.toLowerCase());

        const url = URL.createObjectURL(doc.pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${finalName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        // Delay to prevent browser download popup throttling
        await new Promise((res) => setTimeout(res, 250));
      }
    }
    showToast(`Started download for ${readyDocs.length} individual files!`, 'success');
  };

  const handleCombineAllToSinglePdf = async () => {
    const readyDocs = documents.filter((d) => d.normalizedBlob);
    if (readyDocs.length === 0) {
      showToast('Please upload documents first', 'error');
      return;
    }

    try {
      const blobs = readyDocs.map((d) => d.normalizedBlob);
      const combinedTitle = `DocTag_Scans_Batch_${new Date().toISOString().slice(0, 10)}`;
      const { pdfBlob } = await convertMultipleImagesToPdf(blobs, combinedTitle);

      const downloadUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${combinedTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      showToast(`Merged ${readyDocs.length} pages into a single PDF and downloaded!`, 'success');
    } catch (err: any) {
      showToast(`Failed to combine PDF: ${err.message}`, 'error');
    }
  };

  const handleRemoveDocument = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (doc?.pdfUrl) {
      URL.revokeObjectURL(doc.pdfUrl);
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleClearAll = () => {
    if (documents.length === 0) return;

    setConfirmDetails({
      title: 'Clear Entire Queue',
      subtitle: 'Reset Scanned Documents',
      message: `Are you sure you want to remove all ${documents.length} document(s) from the queue? This resets the workspace so you can upload a new batch.`,
      confirmButtonText: `Clear All (${documents.length})`,
      confirmButtonVariant: 'danger',
      iconType: 'trash',
      count: documents.length,
    });

    setConfirmAction(() => () => {
      // Clean up object URLs to free memory
      documents.forEach((d) => {
        if (d.pdfUrl) URL.revokeObjectURL(d.pdfUrl);
      });
      setDocuments([]);
      showToast('Cleared all documents from queue', 'info');
    });

    setConfirmModalOpen(true);
  };

  const handleClearProcessed = () => {
    const processed = documents.filter((d) => d.driveStatus === 'uploaded' || d.pdfStatus === 'ready');
    if (processed.length === 0) {
      showToast('No processed documents to clear', 'info');
      return;
    }

    const processedIds = new Set(processed.map((d) => d.id));
    processed.forEach((d) => {
      if (d.pdfUrl) URL.revokeObjectURL(d.pdfUrl);
    });

    setDocuments((prev) => prev.filter((d) => !processedIds.has(d.id)));
    showToast(`Removed ${processed.length} processed document(s) from queue`, 'success');
  };

  const readyToUploadCount = documents.filter(
    (d) => d.pdfStatus === 'ready' && d.driveStatus !== 'uploaded'
  ).length;

  const uploadedCount = documents.filter((d) => d.driveStatus === 'uploaded').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 animate-bounce duration-300">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border text-sm font-medium flex items-center gap-2.5 backdrop-blur-md ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
                : notification.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
                : 'bg-slate-900/90 text-slate-200 border-amber-400/40'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {notification.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
            {notification.type === 'info' && <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />}
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-400/20">
              <Tag className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-slate-100 tracking-tight">DocTag OCR</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-400/15 text-amber-400 border border-amber-400/20 uppercase tracking-wider">
                  Vision + PDF
                </span>
              </div>
              <p className="text-xs text-slate-400">JPG & HEIC → Yellow Tag OCR Renamer → Google Drive</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Engine Selector */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs">
              <button
                onClick={() => {
                  setPreferredEngine('auto');
                  showToast(hasApiKey ? 'Mode: Auto (Gemini Vision AI)' : 'Mode: Auto (Local Offline OCR)', 'info');
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  preferredEngine === 'auto'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Automatically use Gemini AI if key is present, otherwise fallback to local"
              >
                Auto
              </button>
              <button
                onClick={() => {
                  setPreferredEngine('local');
                  showToast('Mode: 100% Local In-Browser OCR (No API key needed!)', 'success');
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  preferredEngine === 'local'
                    ? 'bg-blue-500 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Run completely locally in browser using Tesseract.js - zero API keys required"
              >
                Local Only
              </button>
              {hasApiKey && (
                <button
                  onClick={() => {
                    setPreferredEngine('gemini');
                    showToast('Mode: Gemini Vision AI forced', 'info');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    preferredEngine === 'gemini'
                      ? 'bg-purple-500 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Force Gemini Vision AI OCR"
                >
                  Gemini
                </button>
              )}
            </div>

            {hasApiKey !== null && (
              <button
                onClick={() => setShowKeyGuideModal(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  hasApiKey
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-blue-500/10 text-blue-300 border-blue-500/30 hover:bg-blue-500/20'
                }`}
                title="OCR Engine & Key Settings"
              >
                <span className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                <span>{hasApiKey ? 'Gemini AI Ready' : 'Running 100% Local (Free)'}</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Target: <strong className="text-amber-300 font-semibold">{selectedFolderName}</strong></span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Drive Integration Banner */}
        <DriveAuthBar
          isAuthenticated={isAuthenticated}
          userEmail={userProfile?.email}
          userName={userProfile?.name}
          userPhoto={userProfile?.picture}
          onAuthSuccess={(token) => {
            showToast('Google Drive connected! Folders loaded.', 'success');
            loadDriveFolders(token);
          }}
          onSignOut={() => {
            clearAuth();
            showToast('Google Drive disconnected', 'info');
          }}
        />

        {/* Workflow Guide Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 font-bold border border-amber-400/20 text-sm">
              1
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Convert JPG & HEIC</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Upload scans or iPhone HEIC photos. We convert them to high-resolution vector-scaled PDF pages.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 font-bold border border-amber-400/20 text-sm">
              2
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Yellow Tag OCR Renaming</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Gemini OCR pinpoints yellow tags or sticky notes, reads the label, and formats an archival-ready filename.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 font-bold border border-amber-400/20 text-sm">
              3
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Save to Google Drive Folder</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Choose or create a target folder in your Google Drive and upload organized PDFs with one click.
              </p>
            </div>
          </div>
        </div>

        {/* Upload Zone & Folder Settings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <FileUploader
              onFilesSelected={handleFilesSelected}
              isProcessing={isBatchProcessing}
            />
          </div>

          <div className="lg:col-span-1 space-y-4">
            <FolderSelector
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelectFolder={(id, name) => {
                setSelectedFolderId(id);
                setSelectedFolderName(name);
                showToast(`Destination changed to "${name}"`, 'info');
              }}
              onCreateFolder={handleCreateFolder}
              isLoading={isLoadingFolders}
              onRefresh={() => {
                const token = getCachedToken();
                if (token) loadDriveFolders(token);
              }}
            />
          </div>
        </div>

        {/* Documents Queue Section */}
        {documents.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-slate-950 font-bold text-xs">
                  {documents.length}
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Documents in Queue</h3>
                  <p className="text-xs text-slate-400">
                    {readyToUploadCount} ready for Drive • {uploadedCount} already saved
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Download All as ZIP of Individual PDFs */}
                <button
                  onClick={handleDownloadAllZip}
                  disabled={readyToUploadCount === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-400/20 disabled:opacity-40 disabled:pointer-events-none"
                  title="Downloads all individual PDFs inside a clean ZIP archive"
                >
                  <Archive className="w-4 h-4" />
                  Download All as ZIP ({readyToUploadCount})
                </button>

                {/* Optional: Download individual PDFs one by one directly */}
                <button
                  onClick={handleDownloadAllOneByOne}
                  disabled={readyToUploadCount === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  title="Downloads every ready PDF directly to your browser's Downloads folder"
                >
                  <Files className="w-3.5 h-3.5 text-slate-300" />
                  Download Individually
                </button>

                {/* Batch Rotate All Upright */}
                <button
                  onClick={() => handleRotateAll(90)}
                  disabled={documents.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  title="Rotate all documents 90° Clockwise to make sideways scans upright"
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                  Rotate All ↷ 90°
                </button>

                {/* Batch Rescan All in Current Orientation */}
                <button
                  onClick={handleRescanAll}
                  disabled={documents.length === 0 || isBatchProcessing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 hover:text-amber-200 text-xs font-semibold border border-amber-400/30 transition-colors disabled:opacity-40 disabled:pointer-events-none shadow-xs"
                  title="Re-scan and look at all documents again in their current orientation to update yellow tags and filenames"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isBatchProcessing ? 'animate-spin' : ''}`} />
                  Rescan All
                </button>

                {/* Optional: Combine into 1 single multi-page PDF */}
                <button
                  onClick={handleCombineAllToSinglePdf}
                  disabled={readyToUploadCount === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold border border-slate-700/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  title="Merge all scanned pages into one multi-page PDF document"
                >
                  <Download className="w-3.5 h-3.5" />
                  Combined PDF
                </button>

                {/* Google Drive Upload */}
                {isAuthenticated && (
                  <button
                    onClick={handleUploadAllToDrive}
                    disabled={readyToUploadCount === 0 || isBatchProcessing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Save All to Drive
                  </button>
                )}

                {/* Clear Processed if there are ready or uploaded items */}
                {documents.some((d) => d.driveStatus === 'uploaded' || d.pdfStatus === 'ready') && (
                  <button
                    onClick={handleClearProcessed}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                    title="Remove only the documents that have already finished processing or saved to Drive"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Clear Processed
                  </button>
                )}

                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 transition-colors"
                  title="Clear all documents from the queue to start a fresh batch"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Queue
                </button>
              </div>
            </div>

            {/* List of Document Cards */}
            <div className="space-y-4">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  targetFolderName={selectedFolderName}
                  onUpdateFilename={handleUpdateFilename}
                  onProcessOcr={handleRetryOcr}
                  onConvertToPdf={handleConvertToPdf}
                  onUploadToDrive={handleUploadSingleToDrive}
                  onRemove={handleRemoveDocument}
                  onRotate={handleRotateDocument}
                  isDriveConnected={isAuthenticated}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      {confirmModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => {
            setConfirmModalOpen(false);
            setConfirmAction(null);
          }}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  confirmDetails.confirmButtonVariant === 'danger'
                    ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                    : 'bg-amber-400/15 border border-amber-400/30 text-amber-400'
                }`}
              >
                {confirmDetails.iconType === 'trash' ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">{confirmDetails.title}</h3>
                <p className="text-xs text-slate-400">{confirmDetails.subtitle || 'Workspace Confirmation'}</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 mb-5 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              {confirmDetails.message}
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmModalOpen(false);
                  setConfirmAction(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmModalOpen(false);
                  if (confirmAction) confirmAction();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                  confirmDetails.confirmButtonVariant === 'danger'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                    : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/20'
                }`}
              >
                {confirmDetails.confirmButtonText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini API Key Guide Modal */}
      {showKeyGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Gemini API Key Configuration</h3>
                  <p className="text-xs text-slate-400">Powers Yellow Tag OCR & Document Vision</p>
                </div>
              </div>
              <button
                onClick={() => setShowKeyGuideModal(false)}
                className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-200">Current Server Status:</span>
                  <span className={`inline-flex items-center gap-1 font-bold ${hasApiKey ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {hasApiKey ? '✓ Key Configured' : '⚠ Key Missing in Environment'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Variable name: <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">GEMINI_API_KEY</code>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200/90 text-xs flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-300">Run 100% Free Locally Without Any Key</p>
                  <p className="text-[11px] text-blue-200/70 mt-0.5">
                    You can toggle to <strong>"Local Only"</strong> in the top header. The app uses an in-browser Tesseract.js engine with custom yellow tag color clustering. It processes images locally on your device with zero API keys and zero cost.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-slate-200">Optional: Add a Gemini Vision API Key for high-accuracy cloud AI:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-400 leading-relaxed">
                  <li>
                    In the Google AI Studio sidebar, click <strong className="text-slate-200">Settings &gt; Secrets</strong>.
                  </li>
                  <li>
                    Add variable <code className="text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">GEMINI_API_KEY</code>.
                  </li>
                  <li>
                    Paste your key from <span className="text-amber-400">aistudio.google.com/apikey</span> and save.
                  </li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-200/90 text-[11px] flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  The Gemini API key is securely handled on the backend server and is never exposed to browser client code.
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  fetch('/api/health')
                    .then((res) => res.json())
                    .then((data) => {
                      setHasApiKey(Boolean(data.hasApiKey));
                      if (data.hasApiKey) {
                        showToast('Gemini API key is active and ready!', 'success');
                      } else {
                        showToast('Key not detected yet. Check Settings > Secrets.', 'info');
                      }
                    });
                  setShowKeyGuideModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-400/20"
              >
                Check & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>DocTag OCR • Convert JPG / HEIC to PDF • Yellow Tag Text Recognition • Google Drive Folder Organization</p>
      </footer>
    </div>
  );
}
