import { useState, type FormEvent } from 'react';
import { ShieldCheck, Ticket, Users, Eye, EyeOff } from 'lucide-react';
import type { PublicUser, SessionInfo } from '@shared/types.ts';
import { storage } from './storage.ts';

interface AuthProps {
  session: SessionInfo;
  onLogin: (user: PublicUser) => void;
}

/** Sign-in only. There is no self sign-up: the Admin creates every account in the portal. */
export default function Auth({ session, onLogin }: AuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await storage.login({ email, password });
      onLogin(result.user);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <a className="auth-brand" href="/">
          A<span>2</span>Z <small>POWER SOLUTION / SERVICE DESK</small>
        </a>
        <div className="auth-story-content">
          <span className="welcome-pill">
            <span />
            SERVICE, CONNECTED.
          </span>
          <h1>
            Every request.
            <br />
            Every team.
            <br />
            <em>One workspace.</em>
          </h1>
          <p>A simpler way to connect your stores, supervisors and service team.</p>
          <div className="auth-benefits">
            <div>
              <Ticket size={21} />
              <span>
                Track every service request<small>From the first complaint to resolution.</small>
              </span>
            </div>
            <div>
              <Users size={21} />
              <span>
                Keep the right people connected
                <small>Dedicated access for clients, supervisors and field teams.</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={21} />
              <span>
                Admin stays in control
                <small>Accounts, team activity and ticket progress.</small>
              </span>
            </div>
          </div>
        </div>
        <span className="auth-footer">A2Z Power Solution · Service Desk</span>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">WELCOME TO A2Z</span>
          <h2>Welcome back</h2>
          <p className="auth-subtitle">Sign in to manage your service workspace.</p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={submit}>
            <label className="field">
              Email address<span> *</span>
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={200}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <div className="password-field">
              <label className="field">
                Password<span> *</span>
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button className="primary auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : 'Sign in'}
            </button>
          </form>
          <p className="auth-note">
            <ShieldCheck size={15} />
            Accounts are created by A2Z. Need access? Contact your A2Z administrator.
          </p>
          {session.needsSetup && (
            <div className="hint">
              No Super Admin exists yet. On the server, set ADMIN_EMAIL and ADMIN_PASSWORD in
              server/.env and run: npm run admin:reset -w server
            </div>
          )}
          <div className="auth-mode">Database mode · server authentication</div>
        </div>
      </main>
    </div>
  );
}
