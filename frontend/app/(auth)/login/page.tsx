'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        toast.error('Invalid credentials');
      } else {
        toast.success('Welcome back');
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      {/* Ambient glow */}
      <div className="fixed -top-[200px] -left-[100px] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_7%,transparent)_0%,transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-[400px] bg-card border border-border rounded-xl overflow-hidden shadow-lg">

        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg grid place-items-center shrink-0 text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 5V4a3 3 0 0 1 6 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="9.5" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-bold tracking-[0.04em] text-foreground uppercase">NEYOFIT</div>
            <div className="text-[9px] font-mono text-primary tracking-[0.14em] uppercase">ACCESS OS</div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-7">
          <div className="text-[10px] font-mono text-muted-foreground tracking-[0.14em] uppercase mb-6">
            SYSTEM LOGIN
          </div>

          <div className="mb-4">
            <label className="block text-[9px] font-mono text-muted-foreground tracking-[0.14em] uppercase mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="admin@neyofit.io"
              className="w-full bg-secondary border border-border rounded-md px-3.5 py-2.5 text-foreground font-mono text-xs outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="mb-6">
            <label className="block text-[9px] font-mono text-muted-foreground tracking-[0.14em] uppercase mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="w-full bg-secondary border border-border rounded-md px-3.5 py-2.5 text-foreground font-mono text-xs outline-none focus:border-primary transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground rounded-md py-3 text-sm font-bold tracking-[0.08em] uppercase cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
