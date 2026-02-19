import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { UserPlus } from 'lucide-react';
import { clsx } from 'clsx';

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!authData.user) {
        setError('Signup failed. Please try again.');
        return;
      }

      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          username,
          currency: 'GBP',
          notifications_enabled: true,
        });

      if (profileError) {
        setError('Failed to create profile. Please try again.');
        return;
      }

      await supabase
        .from('accounts')
        .insert([
          {
            user_id: authData.user.id,
            name: 'Checking Account',
            type: 'checking',
            currency: 'GBP',
            institution: 'Your Bank',
            color: '#00f2ad',
            starting_value: 0,
            is_closed: false,
            opened_date: new Date().toISOString().split('T')[0]
          },
          {
            user_id: authData.user.id,
            name: 'Savings Account',
            type: 'savings',
            currency: 'GBP',
            institution: 'Your Bank',
            color: '#d4af37',
            starting_value: 0,
            is_closed: false,
            opened_date: new Date().toISOString().split('T')[0]
          }
        ]);

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
            <div className="p-3 bg-emerald-vein/20 border border-emerald-vein/30 rounded-sm">
              <UserPlus size={24} className="text-emerald-vein" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white text-center mb-2 tracking-tight">Create Account</h1>
          <p className="text-center text-iron-dust text-sm mb-8">Join and manage your finances</p>

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-iron-dust uppercase tracking-[2px] mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name"
                className="w-full bg-black/20 border border-white/10 rounded-sm px-4 py-3 text-white placeholder-iron-dust/50 focus:border-emerald-vein outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-iron-dust uppercase tracking-[2px] mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-black/20 border border-white/10 rounded-sm px-4 py-3 text-white placeholder-iron-dust/50 focus:border-emerald-vein outline-none transition-colors"
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
                className="w-full bg-black/20 border border-white/10 rounded-sm px-4 py-3 text-white placeholder-iron-dust/50 focus:border-emerald-vein outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-iron-dust uppercase tracking-[2px] mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/20 border border-white/10 rounded-sm px-4 py-3 text-white placeholder-iron-dust/50 focus:border-emerald-vein outline-none transition-colors"
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
                'w-full py-3 px-4 bg-emerald-vein text-black text-xs font-bold uppercase rounded-sm transition-colors',
                loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-vein/90'
              )}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/5">
            <p className="text-center text-sm text-iron-dust">
              Already have an account?{' '}
              <Link to="/login" className="text-emerald-vein hover:text-white transition-colors font-bold">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
