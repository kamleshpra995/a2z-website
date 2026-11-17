import { useState, type FormEvent, type HTMLInputTypeAttribute } from 'react';
import { ShieldCheck, Ticket, Users, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import type { PublicUser, SessionInfo } from '@shared/types.ts';
import { storage } from './storage.ts';
import { asPayload } from './types.ts';

type Screen = 'login' | 'register';
interface AuthForm {
  role?: 'Client' | 'Supervisor';
  name?: string;
  company?: string;
  email?: string;
  password?: string;
}

interface AuthProps {
  session: SessionInfo;
  onLogin: (user: PublicUser) => void;
}

export default function Auth({ session, onLogin }: AuthProps) {
  const [screen, setScreen] = useState<Screen>('login'),
    [form, setForm] = useState<AuthForm>({ role: 'Client' }),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  const change = (next: Screen) => {
    setScreen(next);
    setForm({ role: 'Client' });
    setError('');
    setMessage('');
  };
  const field = (
    label: string,
    key: 'name' | 'company' | 'email' | 'password',
    type: HTMLInputTypeAttribute = 'text',
  ) => (
    <label className="field">
      {label}
      <span> *</span>
      <input
        autoComplete={
          key === 'email'
            ? 'email'
            : key === 'password'
              ? screen === 'login'
                ? 'current-password'
                : 'new-password'
              : key === 'name'
                ? 'name'
                : 'organization'
        }
        type={type}
        required
        minLength={key === 'password' && screen !== 'login' ? 10 : undefined}
        maxLength={key === 'password' ? 128 : 200}
        value={form[key] || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  // Registration waits for Admin approval; login returns the authenticated user to App.
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (screen === 'register') {
        await storage.register(asPayload(form));
        setScreen('login');
        setForm({ email: form.email });
        setMessage('Registration submitted. Admin approval is required before you can log in.');
      } else {
        const result = await storage.login(asPayload(form));
        onLogin(result.user);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <a className="auth-brand" href="#">
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
                <small>Dedicated access for clients and supervisors.</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={21} />
              <span>
                Admin stays in control
                <small>Registrations, team activity and ticket progress.</small>
              </span>
            </div>
          </div>
        </div>
        <span className="auth-footer">A2Z Power Solution · Service Desk</span>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">WELCOME TO A2Z</span>
          <h2>{screen === 'register' ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-subtitle">
            {screen === 'register'
              ? 'Register as a customer or supervisor to get started.'
              : 'Sign in to manage your service workspace.'}
          </p>
          <div className="auth-tabs">
            <button
              className={screen === 'login' ? 'selected' : ''}
              onClick={() => change('login')}
            >
              Login
            </button>
            <button
              className={screen === 'register' ? 'selected' : ''}
              onClick={() => change('register')}
            >
              Register
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="info-note" role="status">
              <CheckCircle2 size={20} />
              {message}
            </div>
          )}
          <form onSubmit={submit}>
            {screen === 'register' && (
              <>
                <label className="field">Register as</label>
                <div className="role-options">
                  {(['Client', 'Supervisor'] as const).map((role) => (
                    <button
                      type="button"
                      key={role === 'Client' ? 'Customer' : role}
                      className={form.role === role ? 'selected' : ''}
                      onClick={() => setForm({ ...form, role })}
                    >
                      {role === 'Client' ? <Ticket size={18} /> : <Users size={18} />}
                      <span>
                        {role === 'Client' ? 'Customer' : role}
                        <small>
                          {role === 'Client' ? 'Your stores & requests' : 'Your service team'}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {screen !== 'login' && field('Full name', 'name')}
            {screen === 'register' && form.role === 'Client' && field('Company name', 'company')}
            {field('Email address', 'email', 'email')}
            <div className="password-field">
              {field('Password', 'password', show ? 'text' : 'password')}
              <button
                type="button"
                className="icon-button"
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {screen !== 'login' && <p className="password-hint">Use 10–128 characters.</p>}
            <button className="primary auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : screen === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          {screen === 'register' && (
            <p className="auth-note">
              <ShieldCheck size={15} />
              New accounts require Admin approval.
            </p>
          )}
          {session.needsSetup && (
            <div className="hint">
              The workspace owner needs to configure the initial Admin account on the server.
            </div>
          )}
          <div className="auth-mode">Database mode · server authentication</div>
        </div>
      </main>
    </div>
  );
}
