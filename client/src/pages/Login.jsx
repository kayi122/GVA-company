import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, MailCheck, KeyRound } from 'lucide-react';
import { api, useAuth } from '../lib.jsx';
import { Brand } from '../components/Brand.jsx';
import { Button, Field, Input, ThemeToggle, cx } from '../components/ui.jsx';

export default function Login() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('password'); // 'password' | 'code'
  const [challenge, setChallenge] = useState(null);

  const done = async () => {
    await refresh();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <aside className="hero-glow relative hidden w-1/2 flex-col justify-center overflow-hidden px-16 text-white lg:flex">
        <div className="max-w-lg">
          <Brand />
          <h1 className="mt-12 text-[2.6rem] font-extrabold leading-[1.15] tracking-tight">
            Field sales,
            <br />
            from first hello to
            <br />
            <span className="text-lime-brand">a connected home.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-300">
            One place for agents, supervisors, finance and operations to track every lead, confirm every payment and
            get every fiber installation done.
          </p>
          <div className="mt-12 grid max-w-md grid-cols-3 gap-4">
            {[['50', 'Field agents'], ['5', 'Sales teams'], ['FTTH', 'Fiber to the home']].map(([v, l]) => (
              <div key={l} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                <div className="text-xl font-bold text-lime-brand">{v}</div>
                <div className="mt-0.5 text-xs text-slate-400">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Right form panel */}
      <main className="relative flex flex-1 flex-col bg-slate-50 dark:bg-[#0a1226]">
        <div className="hero-glow flex items-center justify-between px-5 py-4 lg:hidden">
          <Brand compact />
        </div>
        <ThemeToggle className="absolute right-6 top-6 hidden lg:inline-flex" />
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[460px]">
            <div className="mb-10 flex gap-8 border-b border-slate-200 dark:border-white/10">
              {[['password', 'Sign in'], ['code', 'Verify email']].map(([key, label]) => (
                <div
                  key={key}
                  className={cx(
                    'label-caps -mb-px border-b-2 pb-3 text-xs',
                    step === key ? 'border-olive-600 text-slate-900 dark:text-white' : 'border-transparent text-slate-400'
                  )}
                >
                  {label}
                </div>
              ))}
            </div>

            {step === 'password' ? (
              <PasswordStep
                onSent={(c) => {
                  setChallenge(c);
                  setStep('code');
                }}
              />
            ) : (
              <CodeStep challenge={challenge} setChallenge={setChallenge} onBack={() => setStep('password')} onDone={done} />
            )}

            <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6 dark:border-white/10">
              <span className="label-caps flex items-center gap-2 text-slate-500">
                <ShieldCheck className="h-4 w-4" /> Secured by GVA
              </span>
              <ThemeToggle className="h-9 w-9 lg:hidden" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PasswordStep({ onSent }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSent(await api('/auth/login', { method: 'POST', body: { username, password } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="animate-fade-up">
      <h2 className="text-3xl font-extrabold tracking-tight">Welcome back</h2>
      <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">Sign in with your username and password to open your dashboard.</p>

      <div className="mt-8 space-y-5">
        <Field label="Username">
          <Input icon={User} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required placeholder="e.g. agent12" />
        </Field>
        <Field label="Password">
          <Input
            icon={Lock}
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="Your password"
            right={
              <button type="button" onClick={() => setShow(!show)} className="rounded-md p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </Field>
      </div>

      {error && <p className="animate-shake mt-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <Button type="submit" size="lg" loading={busy} className="label-caps mt-7 w-full !text-sm">
        Sign in
      </Button>
      <p className="mt-6 text-[15px] text-slate-500 dark:text-slate-400">
        Don't have an account? <span className="font-semibold text-olive-600">Ask your administrator.</span>
      </p>
    </form>
  );
}

function CodeStep({ challenge, setChallenge, onBack, onDone }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(30);
  const refs = useRef([]);

  // Focus the first box on a new code, and again after a wrong code once the inputs are enabled.
  useEffect(() => {
    if (!busy && digits.every((d) => !d)) refs.current[0]?.focus();
  }, [challenge?.challengeId, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (code) => {
    setBusy(true);
    setError('');
    try {
      await api('/auth/verify', { method: 'POST', body: { challengeId: challenge.challengeId, code } });
      await onDone();
    } catch (err) {
      setError(err.message);
      setDigits(Array(6).fill(''));
      if (err.status === 410) setTimeout(onBack, 1800);
    } finally {
      setBusy(false);
    }
  };

  const setAt = (i, value) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      // paste
      const next = clean.slice(0, 6).split('');
      while (next.length < 6) next.push('');
      setDigits(next);
      refs.current[Math.min(clean.length, 5)]?.focus();
      if (clean.length >= 6) verify(clean.slice(0, 6));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  };

  const resend = async () => {
    setError('');
    try {
      setChallenge(await api('/auth/resend', { method: 'POST', body: { challengeId: challenge.challengeId } }));
      setDigits(Array(6).fill(''));
      setCooldown(30);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-6 inline-flex rounded-2xl bg-olive-50 p-3.5 text-olive-600 dark:bg-olive-500/10 dark:text-lime-brand">
        <MailCheck className="h-7 w-7" />
      </div>
      <h2 className="text-3xl font-extrabold tracking-tight">Check your email</h2>
      <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
        We sent a 6-digit code to <span className="font-semibold text-slate-800 dark:text-slate-200">{challenge?.emailHint}</span>. Enter it to confirm it's you.
      </p>

      {challenge?.devCode && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <KeyRound className="h-4 w-4 shrink-0" />
          <span>
            Test mode (email not set up yet). Your code is <b className="font-mono tracking-widest">{challenge.devCode}</b>
          </span>
        </div>
      )}

      <div className={cx('mt-7 flex justify-between gap-2 sm:gap-3', error && 'animate-shake')}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1}`}
            maxLength={i === 0 ? 6 : 1}
            disabled={busy}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className={cx(
              'h-14 w-full min-w-0 rounded-xl border bg-white text-center text-2xl font-bold transition focus:outline-none focus:ring-4 dark:bg-white/5',
              error ? 'border-rose-300 focus:ring-rose-500/15' : 'border-slate-200 focus:border-olive-500 focus:ring-olive-500/15 dark:border-white/10'
            )}
          />
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <Button size="lg" loading={busy} disabled={!digits.every(Boolean)} onClick={() => verify(digits.join(''))} className="label-caps mt-7 w-full !text-sm">
        Verify & continue
      </Button>

      <div className="mt-6 flex items-center justify-between text-sm">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {cooldown > 0 ? (
          <span className="text-slate-400">Resend code in {cooldown}s</span>
        ) : (
          <button onClick={resend} className="font-semibold text-olive-600 hover:text-olive-700">
            Resend code
          </button>
        )}
      </div>
    </div>
  );
}
