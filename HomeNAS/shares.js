import { useState, useEffect } from 'react';
import { api } from './api.js';
import { showAlert } from './utils.js';

export function SharesPanel({ token, onRefresh }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadShares = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.fileshare.getShares(token);
      if (response.result && response.data) setShares(response.data);
    } catch (err) { showAlert(err instanceof Error ? err.message : 'Failed to load shares'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadShares(); }, [token]);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title">Share Management</h2>
        <button onClick={loadShares} disabled={loading} className="btn btn-secondary btn-sm">Refresh</button>
      </div>
      <div className="card-body">
        {shares.length === 0 && !loading ? (
          <div className="empty-state"><svg className="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg><p>No shares found</p></div>
        ) : (
          <div className="table-container">
            <table className="table"><thead><tr><th>Name</th><th>Display Name</th><th>Path</th><th>Protocols</th><th>Recycle Bin</th><th>Actions</th></tr></thead>
            <tbody>{shares.map((share) => (<tr key={share.folder}><td className="font-medium">{share.folder}</td><td>{share.display_name}</td><td className="text-sm text-gray-500">{share.path}</td><td><div className="flex gap-1">{share.protocols.map(p => (<span key={p} className="badge badge-blue">{p.toUpperCase()}</span>))}</div></td><td><span className={share.recycle_bin ? 'badge badge-green' : 'badge badge-gray'}>{share.recycle_bin ? 'Enabled' : 'Disabled'}</span></td><td className="flex items-center gap-2"><button className="btn-icon" title="Edit" onClick={() => setEditing(share)}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.414l11.414-11.414z" /></svg></button></tr>))}</tbody></table></div>)}
      </div>
    </div>
  );
}