import React, { useRef, useState } from 'react';
import { UploadCloud, FileImage, Sparkles, AlertCircle } from 'lucide-react';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, isProcessing }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      e.target.value = ''; // reset so same files can be re-selected if needed
    }
  };

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter((file) => {
      const name = file.name.toLowerCase();
      const type = file.type.toLowerCase();
      return (
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.heic') ||
        name.endsWith('.heif') ||
        name.endsWith('.png') ||
        type.includes('jpeg') ||
        type.includes('png') ||
        type.includes('heic') ||
        type.includes('heif')
      );
    });

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`group relative overflow-hidden rounded-3xl border-2 border-dashed p-8 md:p-12 text-center transition-all cursor-pointer ${
        isDragOver
          ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
          : 'border-slate-700/80 bg-slate-900/50 hover:border-amber-400/60 hover:bg-slate-900/80'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.heic,.heif,.png,image/jpeg,image/png,image/heic,image/heif"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Decorative ambient gradient */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-36 bg-amber-500/10 blur-3xl pointer-events-none rounded-full group-hover:bg-amber-500/20 transition-all duration-500" />

      <div className="relative z-10 flex flex-col items-center max-w-xl mx-auto">
        <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-500/5 border border-amber-400/30 text-amber-400 shadow-lg shadow-amber-950/20 group-hover:scale-110 transition-transform">
          <UploadCloud className="h-10 w-10 text-amber-400" />
          <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
        </div>

        <h3 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight mb-2">
          Drop your <span className="text-amber-400">JPG</span> or <span className="text-amber-400">HEIC</span> photos here
        </h3>
        <p className="text-sm text-slate-300 mb-6 max-w-md leading-relaxed">
          Upload document photos with yellow tags or sticky notes. We'll convert them to crisp PDF, OCR read the tag to rename the file, and upload to Google Drive.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-md shadow-amber-400/20"
          >
            Browse Scans & Photos
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs text-slate-300">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            iPhone HEIC & Android JPG supported
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800/80 w-full flex items-center justify-center gap-6 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> High-DPI PDF Rendering
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Yellow Tag OCR Detection
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" /> Google Drive Folder Sync
          </span>
        </div>
      </div>
    </div>
  );
};
