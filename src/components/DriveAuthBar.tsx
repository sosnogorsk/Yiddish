import React, { useState } from 'react';
import { LogIn, LogOut, CheckCircle2, Shield, Key, ExternalLink } from 'lucide-react';
import { setAccessToken, clearAuth } from '../services/authService';

interface DriveAuthBarProps {
  isAuthenticated: boolean;
  userEmail?: string;
  userName?: string;
  userPhoto?: string;
  onAuthSuccess: (token: string) => void;
  onSignOut: () => void;
}

export const DriveAuthBar: React.FC<DriveAuthBarProps> = ({
  isAuthenticated,
  userEmail,
  userName,
  userPhoto,
  onAuthSuccess,
  onSignOut,
}) => {
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [inputError, setInputError] = useState('');

  const handleManualConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) {
      setInputError('Please enter a valid Google OAuth Access Token.');
      return;
    }
    const token = manualToken.trim();
    setAccessToken(token, 3600, { email: 'Connected Google Account', name: 'Google Workspace User' });
    onAuthSuccess(token);
    setShowManualModal(false);
    setManualToken('');
    setInputError('');
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            {userPhoto ? (
              <img src={userPhoto} alt={userName || 'User'} className="w-10 h-10 rounded-full border border-slate-700" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-400/20">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"/>
                </svg>
              </div>
            )}
            {isAuthenticated && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 border-2 border-slate-900" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-slate-100 text-sm">
                {isAuthenticated ? (userName || 'Google Drive Connected') : 'Connect Google Drive Storage'}
              </h4>
              {isAuthenticated ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="text-[11px] text-amber-400/90 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  Required for folder upload
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAuthenticated
                ? (userEmail ? `Signed in as ${userEmail}` : 'Ready to save converted PDFs to folders')
                : 'Scans will be converted to PDF with OCR tag renaming. Connect Drive to auto-save.'}
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2.5 self-end sm:self-center">
          {isAuthenticated ? (
            <button
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowManualModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-md shadow-amber-400/20 transition-all"
              >
                <Key className="w-3.5 h-3.5" />
                Connect Google Drive
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Manual / Direct Token Modal (Client-side safe with scopes) */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
                  <Shield className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Connect Google Drive</h3>
                  <p className="text-xs text-slate-400">Authenticate for folder browsing & file uploads</p>
                </div>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              DocTag OCR uses Google Drive to store and organize your converted PDF documents with yellow-tag OCR names.
            </p>

            <form onSubmit={handleManualConnect} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Google OAuth Access Token (drive.file scope)
                </label>
                <input
                  type="password"
                  placeholder="Paste OAuth access token (ya29...)"
                  value={manualToken}
                  onChange={(e) => {
                    setManualToken(e.target.value);
                    setInputError('');
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 font-mono"
                />
                {inputError && <p className="text-rose-400 text-xs mt-1.5">{inputError}</p>}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <p className="font-medium text-slate-300">Fast Token Instructions:</p>
                <p>1. You can generate an access token instantly via <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-amber-400 underline inline-flex items-center gap-0.5">Google OAuth 2.0 Playground <ExternalLink className="w-2.5 h-2.5" /></a> selecting Drive API v3 (<code className="text-amber-300">drive.file</code>).</p>
                <p>2. Tokens are kept purely in-memory in your current session and never stored permanently.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-400/20"
                >
                  Connect Storage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
