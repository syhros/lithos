import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LogIn } from 'lucide-react';
import { clsx } from 'clsx';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      navigate('/');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1a1c1e] border border-white/10 rounded-sm p-8 shadow-2xl">
          <div className="flex justify-center mb-8">
            <div className="p-3 bg-magma/20 border border-magma/30 rounded-sm">
              <LogIn size={24} className="text-magma" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white text-center mb-2 tracking-tight">Welcome Back</h1>
          <p className="text-center text-iron-dust text-sm mb-8">Sign in to your account</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-iron-dust uppercase tracking-[2px] mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-black/20 border border-white/10 rounded-sm px-4 py-3 text-white placeholder-iron-dust/50 focus:border-magma outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-iron-dust uppercase tracking-[2px] mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/20 border border-white/10 rounded-sm px-4 py-3 text-white placeholder-iron-dust/50 focus:border-magma outline-none transition-colors"
                required
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-900/30 rounded-sm p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={clsx(
                'w-full py-3 px-4 bg-magma text-black text-xs font-bold uppercase rounded-sm transition-colors',
                loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-magma/90'
              )}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/5">
            <p className="text-center text-sm text-iron-dust">
              Don't have an account?{' '}
              <Link to="/signup" className="text-magma hover:text-white transition-colors font-bold">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
