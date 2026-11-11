import { useState, useEffect } from 'react';
import { api, LED_COLORS } from './api.js';
import { showAlert } from './utils.js';

export function LedPanel({ token, onRefresh }) {
  const [led, setLed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newColor, setNewColor] = useState('BLUE');
  const [newBrightness, setNewBrightness] = useState(10);
  const [newDndStart, setNewDndStart] = useState({ hour: '23', minute: '00' });
  const [newDndEnd, setNewDndEnd] = useState({ hour: '07', minute: '00' });
  const [dndEnabled, setDndEnabled] = useState(false);

  const loadLed = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [brightnessRes, dndRes] = await Promise.all([
        api.hwmonitor.getLedBrightness(token),
        api.hwmonitor.getDontDisturbInfo(token)
      ]);
      if (brightnessRes.result && brightnessRes.data) setLed(prev => ({ ...prev, ...brightnessRes.data }));
      if (dndRes.result && dndRes.data) {
        setLed(prev => ({ ...prev, ...dndRes.data }));
        if (dndRes.data.dnd_start && dndRes.data.dnd_end) {
          setNewDndStart(dndRes.data.dnd_start);
          setNewDndEnd(dndRes.data.dnd_end);
          setDndEnabled(true);
        }
      }
    } catch (err) { console.error('Failed to load LED:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadLed(); }, [token]);

  const applyLedSettings = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (led?.color !== newColor) {
        await api.hwmonitor.registerStatus(token, newColor, 0);
        await api.hwmonitor.setStatus(token);
      }
      if (led?.brightness !== newBrightness) {
        await api.hwmonitor.setLedBrightness(token, newBrightness);
      }
      if (dndEnabled) {
        await api.hwmonitor.setDontDisturb(token, newDndStart, newDndEnd);
      }
      showAlert('LED settings applied', 'success');
      loadLed();
    } catch (err) { showAlert(err instanceof Error ? err.message : 'Failed to apply LED settings'); }
    finally { setSaving(false); }
  };

  const formatTime = (time) => `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title">LED Control</h2>
        <button onClick={loadLed} disabled={loading} className="btn btn-secondary btn-sm">Refresh</button>
      </div>
      <div className="card-body">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">LED Color & Brightness</h3>
            <div className="space-y-4">
              <div>
                <label className="form-label">Color</label>
                <div className="color-grid">
                  {LED_COLORS.map(color => (
                    <button key={color} type="button" onClick={() => setNewColor(color)} className={`color-swatch ${newColor === color ? 'selected' : ''}`} style={{ backgroundColor: color.toLowerCase() === 'off' ? '#9ca3af' : color.toLowerCase() }} title={color} />
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Brightness: {newBrightness}%</label>
                <input type="range" min="0" max="100" value={newBrightness} onChange={e => setNewBrightness(Number(e.target.value))} className="slider" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Do Not Disturb Schedule</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={dndEnabled} onChange={e => setDndEnabled(e.target.checked)} className="checkbox-input" />
                <label className="form-label cursor-pointer">Enable Do Not Disturb</label>
              </label>
              {dndEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Start Time</label>
                    <div className="flex gap-2">
                      <select value={newDndStart.hour} onChange={e => setNewDndStart({...newDndStart, hour: e.target.value})} className="select flex-1">
                        {Array.from({length: 24}, (_, i) => String(i).padStart(2, '0')).map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <select value={newDndStart.minute} onChange={e => setNewDndStart({...newDndStart, minute: e.target.value})} className="select w-24">
                        {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">End Time</label>
                    <div className="flex gap-2">
                      <select value={newDndEnd.hour} onChange={e => setNewDndEnd({...newDndEnd, hour: e.target.value})} className="select flex-1">
                        {Array.from({length: 24}, (_, i) => String(i).padStart(2, '0')).map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <select value={newDndEnd.minute} onChange={e => setNewDndEnd({...newDndEnd, minute: e.target.value})} className="select w-24">
                        {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <div className="pt-4">
                <button onClick={applyLedSettings} disabled={saving} className="btn btn-primary w-full">{saving ? 'Applying…' : 'Apply LED Settings'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}