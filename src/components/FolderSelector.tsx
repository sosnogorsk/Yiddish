import React, { useState } from 'react';
import { GoogleDriveFolder } from '../types';
import { Folder, FolderPlus, Check, RefreshCw, HardDrive, ChevronRight } from 'lucide-react';

interface FolderSelectorProps {
  folders: GoogleDriveFolder[];
  selectedFolderId: string; // 'root' for root Drive or a specific folder ID
  onSelectFolder: (folderId: string, folderName: string) => void;
  onCreateFolder: (name: string) => Promise<void>;
  isLoading: boolean;
  onRefresh: () => void;
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  isLoading,
  onRefresh,
}) => {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      await onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setShowCreateInput(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const selectedFolderObj = folders.find((f) => f.id === selectedFolderId);
  const activeLabel = selectedFolderId === 'root' ? 'My Drive (Root)' : (selectedFolderObj?.name || 'Selected Folder');

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
              <Folder className="w-4 h-4" />
            </span>
            <h3 className="font-semibold text-slate-100 text-base">Target Google Drive Folder</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Current destination: <span className="text-amber-400 font-medium">{activeLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh folders"
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={() => setShowCreateInput(!showCreateInput)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 rounded-lg transition-all"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New Folder
          </button>
        </div>
      </div>

      {showCreateInput && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-slate-950/80 rounded-xl border border-amber-400/30 flex gap-2 items-center">
          <input
            type="text"
            placeholder="Folder name, e.g. Scanned Receipts or Yellow Tag Invoices"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 placeholder:text-slate-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={creating || !newFolderName.trim()}
            className="px-3 py-1.5 bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg hover:bg-amber-300 transition-all disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setShowCreateInput(false)}
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </form>
      )}

      {folders.length > 5 && (
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search folders..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-slate-600"
          />
        </div>
      )}

      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
        {/* Root Option */}
        <button
          onClick={() => onSelectFolder('root', 'My Drive (Root)')}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
            selectedFolderId === 'root'
              ? 'bg-amber-400/15 border border-amber-400/40 text-amber-200 font-medium'
              : 'bg-slate-950/40 hover:bg-slate-800/60 border border-transparent text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <HardDrive className={`w-4 h-4 shrink-0 ${selectedFolderId === 'root' ? 'text-amber-400' : 'text-slate-400'}`} />
            <span className="truncate">My Drive (Root Folder)</span>
          </div>
          {selectedFolderId === 'root' && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950">
              <Check className="w-3 h-3 stroke-[3]" />
            </span>
          )}
        </button>

        {/* Dynamic Folders */}
        {filteredFolders.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          return (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id, folder.name)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                isSelected
                  ? 'bg-amber-400/15 border border-amber-400/40 text-amber-200 font-medium'
                  : 'bg-slate-950/40 hover:bg-slate-800/60 border border-transparent text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="truncate">{folder.name}</span>
              </div>
              {isSelected && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              )}
            </button>
          );
        })}

        {filteredFolders.length === 0 && folders.length > 0 && (
          <p className="text-xs text-center py-4 text-slate-500">No folders match "{searchFilter}"</p>
        )}

        {folders.length === 0 && !isLoading && (
          <div className="text-center py-4 text-xs text-slate-400">
            No custom folders found. Scans will be saved directly into your Google Drive root, or you can click "New Folder" above.
          </div>
        )}
      </div>
    </div>
  );
};
