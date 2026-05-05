import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import toast from 'react-hot-toast';

const Login = () => {
  const { isAuthenticated, user, isLoading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return null;

  if (isAuthenticated && user) {
    if (user.role === 'student') return <Navigate to="/student/waiting-room" replace />;

    return <Navigate to="/invigilator/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await client.post('/api/auth/login', { 
        email, 
        password 
      });
      
      const { user: userData, token } = response.data;
      login(userData, token);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to login. Please try again.', { id: 'login-error' });
      setEmail('');
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background radial highlight */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 50% 10%, #3b82f6 0%, transparent 40%)'}} />

      <div className="w-full max-w-md z-10 relative">
        <div className="text-center mb-10 flex flex-col items-center relative">
            <h1 className="text-6xl font-mono font-bold tracking-tight text-white mb-2 relative" style={{ textShadow: '0 0 20px rgba(59,130,246,0.6)' }}>
               UIPS
               {/* Scanning Line Animation */}
               <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-400 opacity-80" 
                    style={{ 
                      boxShadow: '0 0 10px #3b82f6', 
                      animation: 'scan 2s ease-in-out infinite alternate' 
                    }} />
            </h1>
            <p className="font-mono text-[10px] tracking-widest text-[#64748b] uppercase">Unified Intelligent Proctoring System</p>
        </div>

        <div className="flex justify-center">
           <form onSubmit={handleSubmit} className="w-full bg-[#151d35] p-8 border border-[#1e2d4a] shadow-[0_0_20px_rgba(59,130,246,0.15)] rounded-lg">
             <h2 className="text-white font-mono uppercase tracking-widest mb-6 text-center text-xl">Sign In</h2>

             <div className="mb-4">
               <label className="block text-[#64748b] font-mono uppercase text-[10px] tracking-widest mb-2">Email Address</label>
               <input 
                 type="email" 
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full p-3 bg-[#0a0e1a] border border-[#1e2d4a] rounded text-white font-mono focus:border-blue-500 focus:outline-none"
                 required
               />
             </div>
             
             <div className="mb-6">
               <label className="block text-[#64748b] font-mono uppercase text-[10px] tracking-widest mb-2">Password</label>
               <input 
                 type="password" 
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 className="w-full p-3 bg-[#0a0e1a] border border-[#1e2d4a] rounded text-white font-mono focus:border-blue-500 focus:outline-none"
                 required
               />
             </div>

             <button 
               type="submit" 
               disabled={isSubmitting}
               className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono tracking-widest uppercase py-3 rounded transition-colors"
             >
               {isSubmitting ? 'Signing In...' : 'Sign In'}
             </button>
             
             <div className="mt-4 text-center">
               <p className="text-[#64748b] font-mono text-xs">
                 Tip: Use "invigilator@example.com" for invigilator, other emails for student role.
               </p>
             </div>
           </form>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(60px); }
        }
      `}</style>
    </div>
  );
};

export default Login;

