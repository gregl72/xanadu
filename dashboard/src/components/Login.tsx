import { useState } from 'react';
import type { CognitoUser } from 'amazon-cognito-identity-js';
import { signIn, completeNewPassword } from '../lib/cognito';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [cognitoUser, setCognitoUser] = useState<CognitoUser | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn(username, password);
      if (result.newPasswordRequired && result.user) {
        setNeedsNewPassword(true);
        setCognitoUser(result.user);
      } else {
        onLogin();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      if (cognitoUser) {
        await completeNewPassword(cognitoUser, newPassword);
        onLogin();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  }

  if (needsNewPassword) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>Set New Password</h1>
          <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.875rem' }}>
            Please set a new password for your account.
          </p>
          <form onSubmit={handleNewPassword}>
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" disabled={loading}>
              {loading ? 'Setting password...' : 'Set Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Xanadu Admin</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
