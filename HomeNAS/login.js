import { useState } from 'react';
import { useAuth } from './auth.js';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username.trim(), password);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon"><span>A</span></div>
          <h1 className="login-title">Amber NAS</h1>
          <p className="login-subtitle">Sign in to access your files</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="form-group">
            <label htmlFor="username" className="form-label">Username</label>
            <input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)} className="form-input" placeholder="admin or chewfamily" required autoComplete="username" disabled={loading} />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <div className="input-wrapper">
              <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="form-input pr-12" placeholder="••••••••" required autoComplete="current-password" disabled={loading} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="toggle-btn" disabled={loading}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>

          <button type="submit" disabled={loading || !username.trim() || !password} className="btn btn-primary w-full py-3">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400 text-center">Connects to NAS at <code className="bg-gray-100 px-1 rounded">192.168.68.53:8080</code></p>
      </div>
    </div>
  );
}