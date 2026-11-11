import { useState, useCallback, useEffect } from 'react';
import { api, downloadFile, formatBytes } from './api.js';
import { showAlert } from './utils.js';
import { CreateFolderModal, RenameFolderModal, DeleteConfirmModal, UploadModal } from './modals.js';

export function FileBrowserHeader({ currentFolder, onGoUp, onCreateFolder }) {
  return (
    <div className="fb-header flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
      <h2 className="text-lg font-semibold text-gray-900">File Browser</h2>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>{currentFolder ? `/share/${currentFolder}` : 'Shares'}</span>
        {currentFolder && (
          <button onClick={onGoUp} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs transition-colors">↑ Shares</button>
        )}
      </div>
      {!currentFolder && (
        <button onClick={onCreateFolder} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 text-sm font-bold rounded-lg transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Create Folder</button>
      )}
    </div>
  );
}

export function FolderList({ folders, loading, onSelectFolder, onRenameFolder, onDeleteFolder }) {
  return (
    <>
      <div className="grid grid-cols-[40px_1fr_100px_140px_100px] px-4 py-3 bg-gray-50 text-gray-500 text-xs font-medium uppercase tracking-wider border-b border-gray-200 sticky top-16 z-10">
        <div></div><div>Name</div><div className="text-right pr-4">Type</div><div>Volume</div><div className="text-center">Actions</div>
      </div>
      {folders.length === 0 && !loading ? (
        <div className="px-6 py-12 text-center text-gray-400"><svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg><p>No share folders found</p></div>
      ) : (
        folders.map((folder) => (
          <div key={folder.Name} className="grid grid-cols-[40px_1fr_100px_140px_100px] px-4 py-3 items-center hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-0" onClick={() => onSelectFolder(folder.Name)}>
            <div className="flex items-center justify-center"><svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 002-2h-8l-2-2z" /></svg></div>
            <div className="truncate font-medium text-gray-900">{folder.Name}</div>
            <div className="text-right pr-4 text-sm text-gray-500">{folder.FsAttr?.Type === 'btrfs_subv' ? 'Internal' : 'External'}</div>
            <div className="text-sm text-gray-500">{folder.Volume || '—'}</div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); onRenameFolder(folder.Name); }} className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors" title="Rename"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.414l11.414-11.414z" /></svg></button>
              <button onClick={() => onDeleteFolder(folder.Name)} className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v12m-6 0h14" /></svg></button>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        ))
      )}
    </>
  );
}

export function FileList({ files, loading, currentFolder, onDownload }) {
  return (
    <>
      <div className="grid grid-cols-[40px_1fr_100px_140px_100px] px-4 py-3 bg-gray-50 text-gray-500 text-xs font-medium uppercase tracking-wider border-b border-gray-200 sticky top-16 z-10">
        <div></div><div>Name</div><div className="text-right pr-4">Size</div><div>Modified</div><div className="text-center">Actions</div>
      </div>
      {files.length === 0 && !loading ? (
        <div className="px-6 py-12 text-center text-gray-400"><svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg><p>This folder is empty</p></div>
      ) : (
        files.map((fileName) => (
          <div key={fileName} className="grid grid-cols-[40px_1fr_100px_140px_100px] px-4 py-3 items-center hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
            <div className="flex items-center justify-center"><svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <div className="truncate font-medium text-gray-900">{fileName}</div>
            <div className="text-right pr-4 text-sm text-gray-500">—</div>
            <div className="text-sm text-gray-500">—</div>
            <div className="flex items-center justify-center"><button onClick={(e) => { e.stopPropagation(); onDownload(fileName); }} className="px-3 py-1.5 text-sm text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors" title="Download"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button></div>
          </div>
        ))
      )}
    </>
  );
}

export function FileBrowser({ token }) {
  const [shareFolders, setShareFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderFiles, setFolderFiles] = useState([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetFolder, setRenameTargetFolder] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState('folder');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const loadShareFolders = useCallback(async () => {
    if (!token) return;
    setBrowserLoading(true); setBrowserError('');
    try {
      const response = await api.folder.list(token);
      if (response.result && response.data) setShareFolders(response.data.filter(f => f.Exist));
      else setBrowserError(response.error || 'Failed to load share folders');
    } catch (err) { setBrowserError(err instanceof Error ? err.message : 'Failed to load share folders'); }
    finally { setBrowserLoading(false); }
  }, [token]);

  const loadFolderFiles = useCallback(async (folderName) => {
    if (!token) return;
    setBrowserLoading(true); setBrowserError('');
    try {
      const response = await api.folder.listFiles(token, folderName);
      if (response.result && response.data) setFolderFiles(response.data);
      else setBrowserError(response.error || 'Failed to load folder contents');
    } catch (err) { setBrowserError(err instanceof Error ? err.message : 'Failed to load folder contents'); }
    finally { setBrowserLoading(false); }
  }, [token]);

  useEffect(() => { loadShareFolders(); }, [loadShareFolders]);

  const navigateToFolder = (folderName) => { setCurrentFolder(folderName); loadFolderFiles(folderName); };
  const goUp = () => { setCurrentFolder(null); setFolderFiles([]); };

  const handleDownload = async (fileName) => {
    if (!token || !currentFolder) return;
    try {
      const blob = await downloadFile(`/share/${currentFolder}/${fileName}`, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) { showAlert('Download failed: ' + (err instanceof Error ? err.message : 'Unknown error')); }
  };

  const handleRenameFolder = (folderName) => { setRenameTargetFolder(folderName); setRenameModalOpen(true); };
  const handleDeleteFolder = (folderName) => { setDeleteTarget(folderName); setDeleteType('folder'); setDeleteModalOpen(true); };

  const handleCreateFolder = () => { setCreateModalOpen(true); };

  return (
    <div className="card">
      <div className="fb-header flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">File Browser</h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{currentFolder ? `/share/${currentFolder}` : 'Shares'}</span>
          {currentFolder && (<button onClick={goUp} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs transition-colors">↑ Shares</button>)}
        </div>
        {!currentFolder && (<button onClick={() => setCreateModalOpen(true)} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 text-sm font-bold rounded-lg transition-colors flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Create Folder</button>)}
      </div>

      {browserError && (<div className="mx-6 mt-4 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{browserError}</div>)}

      <div className="divide-y divide-gray-200">
        {currentFolder === null ? <FolderList folders={shareFolders} loading={browserLoading} onSelectFolder={setCurrentFolder} onRenameFolder={setRenameTargetFolder} onDeleteFolder={setDeleteTarget} /> : <FileList files={folderFiles} loading={browserLoading} currentFolder={currentFolder} onDownload={handleDownload} />}
      </div>
    </div>

    <CreateFolderModal token={token} shareFolders={shareFolders} onFolderCreated={loadShareFolders} isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    <RenameFolderModal token={token} folderName={renameTargetFolder} onFolderRenamed={loadShareFolders} isOpen={renameModalOpen} onClose={() => setRenameModalOpen(false)} />
    <DeleteConfirmModal onConfirm={() => {}} isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} itemName={deleteTarget} itemType={deleteType} />
    <UploadModal token={token} currentFolder={currentFolder} onUploadComplete={loadFolderFiles} isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
  </div>
  );
}