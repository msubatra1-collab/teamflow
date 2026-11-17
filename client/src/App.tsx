import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useAuth } from './auth';
import { api } from './api';
import { useToast } from './toast';
import { WorkspaceShell, DashboardPage, BoardPage } from './workspace';

function LoadingPage() { return <div className="loading"><div><div className="spinner" />Checking your workspace…</div></div>; }
function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { user, loading, login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invitationToken = params.get('invite') ?? undefined;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && user) navigate('/app', { replace: true }); }, [loading, user, navigate]);
  if (loading) return <LoadingPage />;
  if (user) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (isRegister) await register(name, email, password, invitationToken);
      else await login(email, password);
      toast(isRegister ? 'Your workspace is ready.' : 'You’re signed in.', 'success');
      navigate('/app', { replace: true });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Please try again.';
      setError(message);
    } finally { setBusy(false); }
  };
  return <main className="auth-page">
    <section className="auth-story">
      <div className="brand"><img src="/brand-mark.svg" alt="" /><div><span className="brand-name" style={{ color: '#fff' }}>Teamflow</span><span className="brand-caption" style={{ color: '#c2c6cc' }}>the shared workbench</span></div></div>
      <div><span className="eyebrow">A clearer way to work together</span><h1>A clear next step for every project.</h1><p>Bring plans, people, and progress into one calm place. Keep the whole team moving without losing the details.</p></div>
      <div className="auth-quote">Good work moves forward together.</div>
    </section>
    <section className="auth-form-side">
      <div className="auth-card">
        <div className="brand"><img src="/brand-mark.svg" alt="" /><div><span className="brand-name">Teamflow</span><span className="brand-caption">the shared workbench</span></div></div>
        <h2>{isRegister ? 'Create your account' : 'Good to see you again'}</h2>
        <p>{invitationToken ? 'Create your account to join the invited project.' : isRegister ? 'Start a shared space for the work ahead.' : 'Sign in to pick up where your team left off.'}</p>
        <form onSubmit={submit}>
          {isRegister && <div className="form-field"><label htmlFor="name">Your name</label><div className="search-box" style={{ height: 42 }}><UserRound size={15} /><input id="name" required minLength={2} maxLength={60} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" style={{ width: '100%' }} /></div></div>}
          <div className="form-field"><label htmlFor="email">Email address</label><div className="search-box" style={{ height: 42 }}><Mail size={15} /><input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" style={{ width: '100%' }} /></div></div>
          <div className="form-field"><label htmlFor="password">Password</label><div className="search-box" style={{ height: 42 }}><LockKeyhole size={15} /><input id="password" type="password" required minLength={isRegister ? 8 : 1} maxLength={72} autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} style={{ width: '100%' }} /></div></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}{!busy && <ArrowRight size={15} />}</button>
        </form>
        <div className="auth-switch">{isRegister ? 'Already have an account? ' : 'New to Teamflow? '}<Link className="auth-link" to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></div>
        <p style={{ marginTop: 22, textAlign: 'center', fontSize: 10, color: '#a1a4aa' }}>Your team’s work stays in your workspace.</p>
      </div>
    </section>
  </main>;
}

function InvitationPage() {
  const { token = '' } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (loading) return;
    if (!user) { setState('ready'); return; }
    let active = true;
    api<{ projectId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' })
      .then((result) => { if (!active) return; setState('ready'); toast('You’re in. Welcome to the project.', 'success'); navigate(`/app/projects/${result.projectId}`, { replace: true }); })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [loading, user, token, navigate, toast]);
  if (loading || state === 'loading') return <LoadingPage />;
  if (!user) return <main className="auth-page"><section className="auth-story"><div className="brand"><img src="/brand-mark.svg" alt="" /><span className="brand-name" style={{ color: '#fff' }}>Teamflow</span></div><div><span className="eyebrow">A project invitation</span><h1>Your team saved you a place.</h1><p>Create an account with the invited email address to join the shared board.</p></div><div className="auth-quote">Good work moves forward together.</div></section><section className="auth-form-side"><div className="auth-card"><div className="empty-icon" style={{ marginLeft: 0 }}><Check size={19} /></div><h2>You’re invited</h2><p>Register with the email address that received this link. Your invitation is valid for a limited time.</p><Link className="primary-button auth-submit" to={`/register?invite=${encodeURIComponent(token)}`}>Create account and join <ArrowRight size={15} /></Link><div className="auth-switch">Already have an account? <Link className="auth-link" to="/login">Sign in</Link></div></div></section></main>;
  return <main className="auth-page"><section className="auth-story"><div className="brand"><img src="/brand-mark.svg" alt="" /><span className="brand-name" style={{ color: '#fff' }}>Teamflow</span></div><div><span className="eyebrow">Project invitation</span><h1>Join your team’s workbench.</h1><p>We’ll connect you to the project and its shared board.</p></div><div className="auth-quote">Good work moves forward together.</div></section><section className="auth-form-side"><div className="auth-card"><div className="empty-icon" style={{ marginLeft: 0 }}><Check size={19} /></div><h2>{state === 'error' ? 'This invite needs a check' : 'Accepting your invitation'}</h2><p>{state === 'error' ? 'This invitation may have expired or may belong to a different email address. Ask the project owner for a fresh link.' : 'Your project is opening now.'}</p>{state === 'error' && <Link className="secondary-button" to="/app">Go to my workspace</Link>}</div></section></main>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/app" replace />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/invite/:token" element={<InvitationPage />} />
    <Route element={<ProtectedRoute />}><Route element={<WorkspaceShell />}>
      <Route path="/app" element={<DashboardPage />} />
      <Route path="/app/projects/:projectId" element={<BoardPage />} />
    </Route></Route>
    <Route path="*" element={<Navigate to="/app" replace />} />
  </Routes>;
}
