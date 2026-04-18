import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // Default to Login for returning users
  const { user, userRole, login, signUp, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  // Immediate redirect after auth state resolves
  useEffect(() => {
    if (user && userRole) {
      if (userRole === 'admin') {
        navigate('/admin');
      } else {
        navigate('/faculty');
      }
    }
  }, [user, userRole, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      setError('No internet connection. Please connect to the network and try again.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      if (isSignUp && err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please switch to Login.');
      } else if (!isSignUp && err.code === 'auth/user-not-found') {
        setError('No account found for this email. Please sign up first.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters long.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Invalid credentials for this email/password login. If this account was created with Google, please use Google sign-in.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('This email is registered with Google sign-in. Please click Sign in with Google.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error while signing in. Check your internet connection and try again.');
      } else {
        setError(err.message || 'Authentication failed.');
      }
      console.error('Auth Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setError('');
      setLoading(true);
      await loginWithGoogle();
    } catch (err) {
      if (err.code === 'auth/account-exists-with-different-credential') {
        setError('This email is already registered with email/password. Please sign in with email instead.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in was cancelled. Please try again.');
      } else {
        setError(err.message || 'Failed to sign in with Google.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center" style={{ minHeight: '80vh' }}>
      <div className="glass-card" style={{ maxWidth: '400px', width: '100%' }}>
        <div className="text-center mb-6">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {isSignUp ? 'Create Faculty Account' : 'Faculty Portal'}
          </h2>
          <p className="text-muted mt-2">
            {isSignUp ? 'Register to start marking attendance' : 'Sign in to mark your attendance'}
          </p>
        </div>

        {error && (
          <div className="sync-banner offline mb-4" style={{ borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Email Address</label>
            <input 
              type="email" 
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          
          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              className="input-field" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <button disabled={loading} type="submit" className="btn btn-outline" style={{ width: '100%' }}>
            {loading ? 'Processing...' : (
              <>
                <LogIn size={20} /> {isSignUp ? 'Sign Up' : 'Login with Email'}
              </>
            )}
          </button>
        </form>

        <div className="text-center mt-6 mb-4">
            <button 
              onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); setError(''); }} 
              className="text-muted" 
              style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
                {isSignUp ? 'Already have an account? Login' : 'Need an account? Sign Up'}
            </button>
        </div>

        <button 
          disabled={loading} 
          onClick={handleGoogleLogin} 
          className="btn btn-outline" 
          style={{ width: '100%', display: 'flex', gap: '10px' }}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" />
          {loading ? 'Processing...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}
