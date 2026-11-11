import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './auth.js';
import { api } from './api.js';
import { formatBytes, getHealthLabel, getSmartLabel } from './utils.js';
import { DashboardStatus } from './dashboard-status.js';
import { FileBrowser } from './filebrowser.js';

function DashboardPage() {
  const { token, username, logout } = useAuth();

  const [volumes, setVolumes] = useState([]);
  const [smartStatus, setSmartStatus] = useState(null);
  const [thermalStatus, setThermalStatus] = useState(null);
  const [sensorData, setSensorData] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [shares, setShares] = useState([]);
  const [users, setUsers] = useState([]);
  const [ledStatus, setLedStatus] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboardData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setRefreshing(true);
    setError('');

    try {
      const results = await Promise.allSettled([
        api.storage.getVolumes(token),
        api.storage.getSmartStatus(token),
        api.thermal.getStatus(token),
        api.hwmonitor.getSensors(token),
        api.system.getHealth(token),
        api.fileshare.getShares(token),
        api.user.getUserList(token),
        api.hwmonitor.getLedBrightness(token),
        api.hwmonitor.getDontDisturbInfo(token),
      ]);

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.result && result.value.data) {
          switch (index) {
            case 0: setVolumes(result.value.data); break;
            case 1: setSmartStatus(result.value.data); break;
            case 2: setThermalStatus(result.value.data); break;
            case 3: setSensorData(result.value.data); break;
            case 4: setHealthStatus(result.value.data); break;
            case 5: setShares(result.value.data); break;
            case 6: setUsers(result.value.data); break;
            case 7: setLedStatus(prev => ({ ...prev, ...result.value.data })); break;
            case 8: setLedStatus(prev => ({ ...prev, ...result.value.data })); break;
          }
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (loading && volumes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  const primaryVolume = volumes[0];

  const handleRefresh = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await loadDashboardData();
    } catch (err) {
      alert('Refresh failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleLogout = (e) => {
    e.preventDefault();
    e.stopPropagation();
    logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
            <span className="text-xl font-bold text-gray-900">A</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Amber NAS Dashboard</h1>
            <p className="text-xs text-gray-500">Welcome, {username || 'User'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {refreshing ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span>Refresh</span>
            )}
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-colors border border-red-200"
          >
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <main className="p-6">
        <DashboardStatus
          volume={primaryVolume ?? null}
          smart={smartStatus}
          thermal={thermalStatus}
          sensors={sensorData}
          health={healthStatus}
          shares={shares}
          users={users}
          led={ledStatus}
        />
        <FileBrowser token={token} />
      </main>
    </div>
  );
}

export default DashboardPage;