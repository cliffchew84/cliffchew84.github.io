import { useState, useEffect } from 'react';
import { api } from './api.js';
import { showAlert, confirmAction } from './utils.js';

export function UsersPanel({ token, onRefresh }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.user.getUserList(token);
      if (response.result && response.data) setUsers(response.data);
    } catch (err) { showAlert(err instanceof Error ? err.message : 'Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, [token]);

  const createUser = async (username, password, description) => {
    // Note: actual create_user API would need to be called
    try { /* await api.user.create_user(token, { username, password, description }); */ loadUsers(); } catch (err) { showAlert(err instanceof Error ? err.message : 'Create failed'); }
  };

  const deleteUser = async (username) => {
    if (!confirmAction(`Delete user ${username}?`)) return;
    try { /* await api.user.del_user(token, username); */ loadUsers(); } catch (err) { showAlert(err instanceof Error ? err.message : 'Delete failed'); }
  };

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title">User Management</h2>
        <button onClick={loadUsers} disabled={loading} className="btn btn-secondary btn-sm">Refresh</button>
      </div>
      <div className="card-body">
        {users.length === 0 && !loading ? (
          <div className="empty-state"><svg className="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1h0m0-9a4 4 0 11-8 0 4 4 0 018 0z" /></svg><p>No users found</p></div>
        ) : (
          <div className="table-container">
            <table className="table"><thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Group</th><th>Actions</th></tr></thead>
            <tbody>{users.map(user => (<tr key={user.name}><td className="font-medium">{user.name}</td><td className="text-gray-500">{user.description}</td><td><span className={`badge ${user.status === 'normal' ? 'badge-green' : 'badge-yellow'}`}>{user.status}</span></td><td>{user.groupname}</td><td className="flex items-center gap-2"><button className="btn-icon" title="Edit"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.414l11.414-11.414z" /></svg></button><button className="btn-icon text-red-600 hover:text-red-700" onClick={() => deleteUser(user.name)} title="Delete"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v12m-6 0h14" /></svg></button></td></tr>))}</tbody></table></div>) : (<div className="text-center py-4 text-gray-500">Loading...</div>)}
      </div>
    </div>
  );
}