import { useState } from 'react';
import { formatBytes, getHealthLabel, getSmartLabel } from './utils.js';

export function StorageCard({ volume }) {
  const usedSpace = volume.totalspace - volume.freespace;
  const totalSpace = volume.totalspace;
  const usagePercent = totalSpace > 0 ? (usedSpace / totalSpace) * 100 : 0;

  return (
    <div className="card mb-6">
      <div className="card-header">
        <h2 className="card-title">Storage Overview</h2>
      </div>
      <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {volume.name} ({volume.raidtype.toUpperCase()}) · {volume.fs_type}
            </span>
            <span className="text-sm text-gray-500">
              {formatBytes(usedSpace)} / {formatBytes(totalSpace)} ({usagePercent.toFixed(1)}%)
            </span>
          </div>
          <div className="progress mb-4">
            <div className="progress-bar" style={{ width: `${usagePercent}%` }}></div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm text-gray-500">
            <div><span className="font-medium text-gray-700">Free:</span> {formatBytes(volume.freespace)}</div>
            <div><span className="font-medium text-gray-700">Status:</span> {volume.status}</div>
            <div><span className="font-medium text-gray-700">Resync:</span> {volume.resync}</div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-amber-500">{formatBytes(totalSpace)}</div>
          <div className="text-sm text-gray-500 mt-1">Total Capacity</div>
        </div>
      </div>
    </div>
  );
}

export function RaidCard({ volume }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">RAID Status</h2>
      </div>
      <div className="card-body space-y-4">
        <div className="flex items-center justify-between"><span className="text-gray-600">Type</span><span className="font-medium text-gray-900">{volume.raidtype.toUpperCase()}</span></div>
        <div className="flex items-center justify-between"><span className="text-gray-600">Status</span><span className="font-medium text-gray-900 capitalize">{volume.status}</span></div>
        <div className="flex items-center justify-between"><span className="text-gray-600">Resync Progress</span><span className="font-medium text-gray-900">{volume.resync}</span></div>
        <div className="flex items-center justify-between"><span className="text-gray-600">Allow Failed Disks</span><span className="font-medium text-gray-900">{volume.allowfaildisknum}</span></div>
        <div className="flex items-center justify-between"><span className="text-gray-600">Active Disks</span><span className="font-medium text-gray-900">{volume.activedisks?.join(', ') || 'N/A'}</span></div>
        <div className="flex items-center justify-between"><span className="text-gray-600">Total Disks</span><span className="font-medium text-gray-900">{volume.totaldisks?.join(', ') || 'N/A'}</span></div>
        {volume.faileddisks?.length && (<div className="flex items-center justify-between text-red-600"><span>Failed Disks</span><span className="font-medium">{volume.faileddisks.join(', ')}</span></div>)}
      </div>
    </div>
  );
}

export function SmartCard({ smart }) {
  return (
    <div className="card">
      <div className="card-header"><h2 className="card-title">Disk Health (SMART)</h2></div>
      <div className="card-body space-y-4">
        {smart ? (
          <>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span className="text-gray-600">Disk 1</span><span className={`px-2 py-1 rounded-full text-xs font-medium ${getSmartLabel(smart.disk1).class}`}>{getSmartLabel(smart.disk1).label}</span></div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span className="text-gray-600">Disk 2</span><span className={`px-2 py-1 rounded-full text-xs font-medium ${getSmartLabel(smart.disk2).class}`}>{getSmartLabel(smart.disk2).label}</span></div>
          </>
        ) : (<div className="text-gray-500 text-center py-4">Loading SMART data...</div>)}
      </div>
    </div>
  );
}

export function HealthCard({ health }) {
  return (
    <div className="card">
      <div className="card-header"><h2 className="card-title">System Health</h2></div>
      <div className="card-body space-y-4">
        {health ? (
          <>
            <div className="flex items-center justify-between"><span className="text-gray-600">Overall Level</span><span className={`px-3 py-1 rounded-full text-sm font-medium ${getHealthLabel(health.level).class}`}>{getHealthLabel(health.level).label} (Level {health.level})</span></div>
            {health.detail.length > 0 && (<div className="space-y-2">{health.detail.map((d, i) => (<div key={i} className="flex items-center justify-between p-2 bg-red-50 rounded text-sm"><span className="text-red-700">{d.reason}</span><span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">Level {d.level}</span></div>)))} : (<div className="text-green-600 text-center py-2">No issues detected</div>)}
          </>
        ) : (<div className="text-gray-500 text-center py-4">Loading health data...</div>)}
      </div>
    </div>
  );
}

export function ThermalCard({ thermal, sensors }) {
  return (
    <div className="card">
      <div className="card-header"><h2 className="card-title">Thermal Status</h2></div>
      <div className="card-body space-y-3">
        {thermal && sensors ? (
          <>
            <div className="flex items-center justify-between"><span className="text-gray-600">CPU Temp</span><span className="font-mono font-medium text-gray-900">{thermal.cpu_temp}°C</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">System Temp</span><span className="font-mono font-medium text-gray-900">{sensors['System temperature']}°C</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">CPU Ambient</span><span className="font-mono font-medium text-gray-900">{sensors['CPU Ambient temperature']}°C</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">Fan Speed</span><span className="font-mono font-medium text-gray-900">{sensors.FAN} RPM</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">DC Input</span><span className="font-mono font-medium text-gray-900">{sensors.DCIN}</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">Thermal State</span><span className="font-medium text-gray-900">{['Normal', 'Warning', 'Critical'][thermal.thermal_state] || 'Unknown'}</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">Disk Thermal</span><span className="font-medium text-gray-900">{thermal.disk_tstate === 0 ? 'Normal' : 'Warning'}</span></div>
          </>
        ) : (<div className="text-gray-500 text-center py-4">Loading thermal data...</div>)}
      </div>
    </div>
  );
}

export function UsersCard({ users }) {
  return (
    <div className="card">
      <div className="card-header"><h2 className="card-title">Users ({users.length})</h2></div>
      <div className="card-body">
        {users.length > 0 ? (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {users.map((user) => (<div key={user.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-medium text-sm">{user.name.charAt(0).toUpperCase()}</div><div><div className="font-medium text-gray-900">{user.name}</div><div className="text-xs text-gray-500">{user.description}</div></div></div><div className="text-right text-sm"><div className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.status === 'normal' ? 'text-green-600 bg-green-100' : 'text-yellow-600 bg-yellow-100'}`}>{user.status}</div><div className="text-gray-500 mt-1">{user.groupname}</div></div></div>))}
        </div>
      ) : (<div className="text-gray-500 text-center py-4">Loading users...</div>)}
      </div>
    </div>
  );
}

export function SharesCard({ shares }) {
  return (
    <div className="card">
      <div className="card-header"><h2 className="card-title">Shares ({shares.length})</h2></div>
      <div className="card-body">
        {shares.length > 0 ? (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {shares.map((share) => (<div key={share.folder} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><div><div className="font-medium text-gray-900">{share.display_name}</div><div className="text-xs text-gray-500">{share.path}</div></div><div className="text-right text-sm"><div className="flex gap-1 justify-end mb-1">{share.protocols.map(p => (<span key={p} className="badge badge-blue">{p.toUpperCase()}</span>))}</div><div className={`px-2 py-0.5 rounded text-xs font-medium ${share.recycle_bin ? 'text-green-600 bg-green-100' : 'text-gray-500 bg-gray-100'}`}>{share.recycle_bin ? 'Recycle Bin: On' : 'Recycle Bin: Off'}</div></div></div>))}
          </div>
        ) : (<div className="text-gray-500 text-center py-4">Loading shares...</div>)}
      </div>
    </div>
  );
}

export function LedCard({ led }) {
  return (
    <div className="card">
      <div className="card-header"><h2 className="card-title">LED Status</h2></div>
      <div className="card-body space-y-4">
        {led ? (
          <>
            <div className="flex items-center justify-between"><span className="text-gray-600">Color</span><div className="flex items-center gap-3"><div className="w-6 h-6 rounded border border-gray-300" style={{ backgroundColor: led.color?.toLowerCase() === 'off' ? '#9ca3af' : led.color?.toLowerCase() || '#9ca3af' }}></div><span className="font-medium text-gray-900 text-uppercase">{led.color || '—'}</span></div></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">Brightness</span><span className="font-medium text-gray-900">{led.brightness}%</span></div>
            {led.dnd_start && led.dnd_end && (<div className="flex items-center justify-between"><span className="text-gray-600">Do Not Disturb</span><span className="font-medium text-gray-900">{led.dnd_start.hour}:{led.dnd_start.minute} - {led.dnd_end.hour}:{led.dnd_end.minute}</span></div>)}
            {!led.dnd_start && (<div className="flex items-center justify-between text-gray-500"><span>Do Not Disturb</span><span className="text-sm">Disabled</span></div>)}
          </>
        ) : (<div className="text-gray-500 text-center py-4">Loading LED data...</div>)}
      </div>
    </div>
  );
}

export function DashboardStatus({ volume, smart, thermal, sensors, health, shares, users, led }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-6 card">
      <div onClick={() => setCollapsed(!collapsed)} className="card-header flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors" role="button" tabIndex={0} aria-expanded={!collapsed} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCollapsed(!collapsed); }}>
        <h2 className="card-title flex items-center gap-2">Dashboard Status<svg className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></h2>
      </div>
      {!collapsed && (
        <div className="card-body">
          {volume && <StorageCard volume={volume} />}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
            {volume && <RaidCard volume={volume} />}
            <SmartCard smart={smart} />
            <HealthCard health={health} />
            <ThermalCard thermal={thermal} sensors={sensors} />
            <UsersCard users={users} />
            <SharesCard shares={shares} />
            <LedCard led={led} />
          </div>
        </div>
      )}
    </div>
  );
}