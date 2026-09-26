import React, { useState, useEffect } from 'react';
import { DocumentItem } from '../types';
import { formatBytes } from '../utils/pdfConverter';
import {
  FileText,
  Tag,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  Upload,
  RefreshCw,
  Edit2,
  Check,
  Eye,
  Trash2,
  Folder,
  Layers,
  Sparkles,
  RotateCw,
  RotateCcw
} from 'lucide-react';

interface DocumentCardProps {
  doc: DocumentItem;
  targetFolderName: string;
  onUpdateFilename: (id: string, newName: string) => void;
  onProcessOcr: (id: string) => void;
  onConvertToPdf: (id: string) => void;
  onUploadToDrive: (id: string) => void;
  onRemove: (id: string) => void;
  onRotate?: (id: string, degrees: number) => void;
  isDriveConnected: boolean;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  targetFolderName,
  onUpdateFilename,
  onProcessOcr,
  onConvertToPdf,
  onUploadToDrive,
  onRemove,
  onRotate,
  isDriveConnected,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editValue, setEditValue] = useState(doc.userCustomFilename);
  const [showFullOcr, setShowFullOcr] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Close preview modal on Escape key press
  useEffect(() => {
    if (!previewModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModalOpen]);

  const handleSaveFilename = () => {
    let clean = editValue.trim().replace(/[/\\?%*:|"<>]/g, '-');
    if (!clean) clean = doc.originalName.replace(/\.[^/.]+$/, '');
    onUpdateFilename(doc.id, clean);
    setIsEditingName(false);
  };

  const handleCancelEditing = () => {
    setEditValue(doc.userCustomFilename);
    setIsEditingName(false);
  };

  const isHeic = doc.originalName.toLowerCase().endsWith('.heic') || doc.originalName.toLowerCase().endsWith('.heif');

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-all hover:border-slate-700">
      <div className="p-4 md:p-6 flex flex-col md:flex-row gap-6 items-start">
        {/* Thumbnail Preview & Rotation - 1/3 horizontal width */}
        <div className="flex flex-col items-center gap-3 shrink-0 w-full md:w-1/3 md:min-w-[260px] md:max-w-[420px]">
          <div
            onClick={() => setPreviewModalOpen(true)}
            className="relative group w-full h-64 sm:h-72 md:h-80 lg:h-96 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center cursor-pointer shadow-inner transition-all hover:border-slate-700"
            title="Click to inspect in high resolution"
          >
            <img
              src={doc.normalizedDataUrl}
              alt={doc.originalName}
              className="w-full h-full object-contain p-1"
            />
            {/* Format badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/90 text-[10px] font-bold tracking-wider text-slate-300 uppercase border border-slate-700/60 backdrop-blur-xs">
              {isHeic ? 'HEIC → JPG' : 'JPG'}
            </div>

            {/* Quick view button overlay */}
            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
              <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/95 border border-slate-700 text-xs font-semibold text-slate-100 shadow-xl">
                <Eye className="w-4 h-4 text-amber-400" />
                Inspect High-Res
              </span>
            </div>
          </div>

          {/* Quick Rotate & Rescan Controls */}
          {onRotate && (
            <div className="flex flex-col w-full gap-2">
              <div className="flex items-center justify-between w-full gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotate(doc.id, -90);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white border border-slate-700/70 transition-all shadow-xs active:scale-98"
                  title="Rotate 90° Counter-Clockwise (Left)"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Rotate ↶ 90°</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotate(doc.id, 90);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white border border-slate-700/70 transition-all shadow-xs active:scale-98"
                  title="Rotate 90° Clockwise (Right) to make text upright"
                >
                  <span>Rotate ↷ 90°</span>
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>

              {/* Rescan Button below rotation */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onProcessOcr(doc.id);
                }}
                disabled={doc.ocrStatus === 'analyzing'}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 hover:text-amber-200 border border-amber-400/30 text-xs font-semibold transition-all shadow-xs disabled:opacity-50 disabled:pointer-events-none active:scale-98"
                title="Look at this image again in its current orientation to detect the yellow tag and update filename"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${doc.ocrStatus === 'analyzing' ? 'animate-spin' : ''}`} />
                <span>{doc.ocrStatus === 'analyzing' ? 'Rescanning Upright...' : 'Rescan Upright Image'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Details & OCR Section */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          {/* Filename header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center bg-slate-950 border-2 border-amber-400 rounded-xl px-2.5 py-1 shadow-inner">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveFilename();
                        if (e.key === 'Escape') handleCancelEditing();
                      }}
                      onBlur={handleSaveFilename}
                      className="w-full bg-transparent text-sm md:text-base font-bold text-slate-100 focus:outline-none"
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      placeholder="e.g. Yiddish_G754"
                    />
                    <span className="text-xs font-semibold text-slate-400 pl-1 select-none">.pdf</span>
                  </div>
                  <button
                    onMouseDown={(e) => {
                      // prevent blur from dismissing before click
                      e.preventDefault();
                      handleSaveFilename();
                    }}
                    className="p-2 bg-amber-400 text-slate-950 rounded-xl hover:bg-amber-300 font-bold transition-all shadow-xs"
                    title="Save name (Enter)"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => {
                    setEditValue(doc.userCustomFilename);
                    setIsEditingName(true);
                  }}
                  className="inline-flex items-center gap-2 group/edit cursor-pointer py-1 px-2 -ml-2 rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700/80 transition-all select-none"
                  title="Click once to rename file"
                >
                  <h4 className="font-bold text-slate-100 text-base md:text-lg truncate tracking-tight group-hover/edit:text-amber-300 transition-colors">
                    {doc.userCustomFilename}.pdf
                  </h4>
                  <div className="flex items-center gap-1 opacity-0 group-hover/edit:opacity-100 text-amber-400 transition-opacity">
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold text-amber-400/90 hidden sm:inline">Click to rename</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <span>Original: {doc.originalName}</span>
                <span>•</span>
                <span>{formatBytes(doc.fileSize)}</span>
                {doc.pdfSize && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">PDF: {formatBytes(doc.pdfSize)}</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => onRemove(doc.id)}
              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              title="Remove document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Yellow Tag OCR detection result callout */}
          {doc.ocrStatus === 'analyzing' && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-1.5 text-xs text-amber-300">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
                <span className="font-medium">
                  {doc.ocrProgressMsg || 'Scanning document for yellow tags and text...'}
                </span>
                {doc.ocrProgress !== undefined && (
                  <span className="ml-auto text-[11px] font-mono text-amber-400 font-bold">{doc.ocrProgress}%</span>
                )}
              </div>
              {doc.ocrProgress !== undefined && (
                <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden mt-1">
                  <div
                    className="bg-amber-400 h-full transition-all duration-300"
                    style={{ width: `${doc.ocrProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {doc.ocrStatus === 'error' && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">OCR Extraction Notice</p>
                <p className="text-[11px] opacity-80">{doc.ocrError || 'Could not auto-detect tag text.'}</p>
              </div>
              <button
                onClick={() => onProcessOcr(doc.id)}
                className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded text-[11px] font-semibold text-rose-200"
              >
                Retry
              </button>
            </div>
          )}

          {doc.ocrStatus === 'success' && doc.ocrResult && (
            <div className="space-y-2.5">
              <div className={`p-3 rounded-xl border flex flex-col gap-2 ${
                doc.ocrResult.yellowTagFound
                  ? 'bg-amber-400/10 border-amber-400/40 text-amber-100'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md text-xs font-black ${
                      doc.ocrResult.yellowTagFound ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}>
                      <Tag className="w-3 h-3" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      {doc.ocrResult.yellowTagFound ? 'Yellow Tag Detected' : 'Header / Fallback OCR'}
                    </span>
                    {doc.ocrEngineUsed === 'local' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
                        Offline Engine (Zero API Key)
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
                        Gemini Vision
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {doc.ocrResult.confidence && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 text-slate-400">
                        {Math.round(doc.ocrResult.confidence * 100)}% match
                      </span>
                    )}
                    <button
                      onClick={() => onProcessOcr(doc.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 hover:text-amber-300 border border-slate-700/60 transition-colors"
                      title="Re-scan and look at image again with current orientation"
                    >
                      <RefreshCw className="w-3 h-3 text-amber-400" />
                      <span>Rescan</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 shrink-0">Extracted Tag Text:</span>
                  <span className="text-sm font-semibold text-amber-300 bg-amber-400/15 px-2.5 py-0.5 rounded-md border border-amber-400/20">
                    "{doc.ocrResult.yellowTagText || 'No explicit text on tag'}"
                  </span>
                </div>

                {doc.ocrResult.tagLocation && (
                  <p className="text-[11px] text-slate-400">
                    Location: <span className="text-slate-300">{doc.ocrResult.tagLocation}</span>
                  </p>
                )}

                {doc.ocrResult.summary && (
                  <p className="text-xs text-slate-300 leading-snug">
                    <span className="text-slate-500 font-medium">Summary:</span> {doc.ocrResult.summary}
                  </p>
                )}
              </div>

              {/* Full OCR toggle */}
              {doc.ocrResult.fullDocumentOcr && (
                <div>
                  <button
                    onClick={() => setShowFullOcr(!showFullOcr)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-slate-700 hover:decoration-slate-400 transition-colors"
                  >
                    {showFullOcr ? 'Hide full document OCR text' : 'View full document OCR transcript'}
                  </button>
                  {showFullOcr && (
                    <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap font-mono">
                      {doc.ocrResult.fullDocumentOcr}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action and Status Bar */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80">
            {/* Left status markers */}
            <div className="flex items-center gap-2">
              {/* PDF Status badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                  doc.pdfStatus === 'ready'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : doc.pdfStatus === 'converting'
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {doc.pdfStatus === 'ready'
                  ? 'PDF Ready'
                  : doc.pdfStatus === 'converting'
                  ? 'Converting...'
                  : 'PDF Pending'}
              </span>

              {/* Drive status badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                  doc.driveStatus === 'uploaded'
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                    : doc.driveStatus === 'uploading'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                {doc.driveStatus === 'uploaded'
                  ? `Saved in ${doc.driveFolderName || targetFolderName}`
                  : doc.driveStatus === 'uploading'
                  ? 'Saving to Drive...'
                  : 'Not on Drive'}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Quick Rescan Button */}
              <button
                onClick={() => onProcessOcr(doc.id)}
                disabled={doc.ocrStatus === 'analyzing'}
                title="Re-scan and look at image again with current orientation"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 text-xs font-medium border border-slate-700/80 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${doc.ocrStatus === 'analyzing' ? 'animate-spin' : ''}`} />
                <span>{doc.ocrStatus === 'analyzing' ? 'Rescanning...' : 'Rescan'}</span>
              </button>

              {/* PDF Download Button */}
              {doc.pdfStatus === 'ready' && doc.pdfUrl && (
                <a
                  href={doc.pdfUrl}
                  download={`${doc.userCustomFilename}.pdf`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </a>
              )}

              {/* Google Drive Upload button */}
              {doc.driveStatus === 'uploaded' && doc.driveFileLink ? (
                <a
                  href={doc.driveFileLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in Google Drive
                </a>
              ) : (
                <button
                  onClick={() => onUploadToDrive(doc.id)}
                  disabled={doc.pdfStatus !== 'ready' || doc.driveStatus === 'uploading' || !isDriveConnected}
                  title={!isDriveConnected ? 'Connect Google Drive first' : 'Save PDF to target Google Drive folder'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all disabled:opacity-40 disabled:pointer-events-none shadow-sm shadow-amber-400/20"
                >
                  {doc.driveStatus === 'uploading' ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Save to Google Drive
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm cursor-pointer"
          onClick={() => setPreviewModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-100 text-base">{doc.userCustomFilename}.pdf</h3>
                <p className="text-xs text-slate-400">High Resolution Inspection View • Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">Esc</kbd> or click outside to close</p>
              </div>

              <div className="flex items-center gap-2">
                {onRotate && (
                  <div className="flex items-center bg-slate-800/90 rounded-xl p-1 border border-slate-700">
                    <span className="text-[11px] font-medium text-slate-400 px-2 hidden sm:inline">Make Upright:</span>
                    <button
                      onClick={() => onRotate(doc.id, -90)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                      title="Rotate 90° Counter-Clockwise (Left)"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>↶ 90°</span>
                    </button>
                    <button
                      onClick={() => onRotate(doc.id, 90)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                      title="Rotate 90° Clockwise (Right)"
                    >
                      <span>↷ 90°</span>
                      <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    </button>
                    <button
                      onClick={() => onRotate(doc.id, 180)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                      title="Flip 180° (Upside Down)"
                    >
                      <span>180°</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setPreviewModalOpen(false)}
                  title="Close (Esc)"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 text-xs font-medium transition-colors"
                >
                  <span>✕</span>
                  <span className="text-[10px] bg-slate-800 border border-slate-700 px-1 py-0.5 rounded font-mono text-slate-400">ESC</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
              <img
                src={doc.normalizedDataUrl}
                alt="Document Full"
                className="max-h-[75vh] object-contain rounded shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
