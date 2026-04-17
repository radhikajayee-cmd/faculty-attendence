import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true); // Default to Sign Up for new users
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
    try {
      setError('');
      setLoading(true);
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        // FOOLPROOF FEATURE: If they tried to login but don't exist, just create the account immediately.
        try {
            console.log("User not found on login. Auto-creating account instead...");
            await signUp(email, password);
            return; // Success!
        } catch (signupErr) {
            setError(signupErr.message || 'Authentication failed. Please check password length (min 6 chars).');
        }
      } else if (err.code === 'auth/email-already-in-use') {
        // If they tried to sign up but exist, just log them in immediately.
        try {
            console.log("User exists on signup. Auto-logging in instead...");
            await login(email, password);
            return; // Success!
        } catch (loginErr) {
             setError('Incorrect password. Please try again.');
        }
      } else if (err.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters long.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else {
        setError(err.message || 'Authentication failed.');
      }
      console.error("Auth Error:", err);
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
      setError('Failed to sign in with Google.');
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
