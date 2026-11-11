import { useState } from 'react';
import { api } from './api.js';
import { showAlert, confirmAction } from './utils.js';

export function CreateFolderModal({ token, shareFolders, onFolderCreated, isOpen, onClose }) {
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !newFolderName.trim()) return;

    setCreatingFolder(true);
    try {
      const volumeName = 'volume1';
      const response = await api.folder.create(token, volumeName, newFolderName.trim());
      if (response.result) {
        onClose();
        onFolderCreated();
      } else {
        showAlert('Create failed: ' + (response.error || 'Unknown error'));
      }
    } catch (err) {
      showAlert('Create failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setCreatingFolder(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Folder</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Folder Name</label>
            <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Enter folder name" className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" required maxLength="64" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={creatingFolder || !newFolderName.trim()} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-gray-900 font-bold rounded-lg transition-colors">{creatingFolder ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RenameFolderModal({ token, folderName, onFolderRenamed, isOpen, onClose }) {
  const [renameFolderName, setRenameFolderName] = useState(folderName);
  const [renamingFolder, setRenamingFolder] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !renameFolderName.trim()) return;

    setRenamingFolder(true);
    try {
      const response = await api.folder.rename(token, folderName, renameFolderName.trim());
      if (response.result) {
        onClose();
        onFolderRenamed();
      } else {
        showAlert('Rename failed: ' + (response.error || 'Unknown error'));
      }
    } catch (err) {
      showAlert('Rename failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setRenamingFolder(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Rename Folder</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New Name</label>
            <input type="text" value={renameFolderName} onChange={e => setRenameFolderName(e.target.value)} placeholder="Enter new folder name" className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" required maxLength="64" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={renamingFolder || !renameFolderName.trim()} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-gray-900 font-bold rounded-lg transition-colors">{renamingFolder ? 'Renaming…' : 'Rename'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteConfirmModal({ onConfirm, isOpen, onClose, itemName, itemType = 'folder' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete {itemType}</h3>
        <p className="text-gray-600 mb-6">Are you sure you want to delete <strong>{itemName}</strong>? This action cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors">Delete</button>
        </div>
      </div>
    </div>
  );
}

export function UploadModal({ token, currentFolder, onUploadComplete, isOpen, onClose }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});

  const handleFileSelect = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over'); };
  const handleDragLeave = (e) => { e.currentTarget.classList.remove('drag-over'); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over'); const newFiles = Array.from(e.dataTransfer.files); setFiles(prev => [...prev, ...newFiles]); };
  const removeFile = (index) => { setFiles(prev => prev.filter((_, i) => i !== index)); };

  const handleUpload = async () => {
    if (!token || files.length === 0) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try { console.log('Uploading:', file.name); setProgress(prev => ({ ...prev, [file.name]: 100 })); } catch (err) { console.error('Upload failed:', err); setProgress(prev => ({ ...prev, [file.name]: -1 })); }
    }
    setUploading(false);
    onUploadComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Files</h3>
        <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${files.length > 0 ? 'border-amber-500 bg-amber-50' : 'border-gray-300'}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <input type="file" id="file-upload" multiple onChange={handleFileSelect} className="hidden" />
          <label htmlFor="file-upload" className="cursor-pointer">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-1 1H8a1 1 0 01-1-1v-3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l4 4m0 0l4-4m-4 4V4" /></svg>
            <p className="text-gray-600 mb-2">Drag & drop files here, or click to browse</p>
            <p className="text-xs text-gray-500">Multiple files supported</p>
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
            {files.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <div><p className="font-medium text-gray-900 truncate max-w-xs">{file.name}</p><p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p></div>
                </div>
                <div className="flex items-center gap-2">
                  {progress[file.name] === -1 ? <span className="text-xs text-red-600">Failed</span> : progress[file.name] >= 0 ? <div className="w-32"><div className="upload-bar"><div className="upload-fill" style={{ width: `${progress[file.name] || 0}%` }}></div></div></div> : <span className="text-xs text-gray-500">Pending</span>}
                  <button onClick={() => removeFile(index)} className="text-gray-400 hover:text-red-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">Cancel</button>
          <button type="button" onClick={handleUpload} disabled={uploading || files.length === 0} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-gray-900 font-bold rounded-lg transition-colors">{uploading ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
    </div>
  );
}

export function LoadingOverlay({ isVisible }) {
  if (!isVisible) return null;
  return <div className="loading-overlay"><div className="spinner" /></div>;
}