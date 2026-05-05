import { createContext, useEffect, useState } from 'react';
import { setAuthToken } from '../api/client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Stub implementation: Check local storage for user token/data
    const loadUser = () => {
      const storedUser = localStorage.getItem('uips_user');
      const token = localStorage.getItem('uips_token');
      
      if (storedUser && token) {
        setUser(JSON.parse(storedUser));
        setAuthToken(token);
      } else {
        setUser(null);
        setAuthToken(null);
      }
      setIsLoading(false);
    };

    loadUser();
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('uips_user', JSON.stringify(userData));
    localStorage.setItem('uips_token', token);
    setUser(userData);
    setAuthToken(token);
  };

  const logout = () => {
    localStorage.removeItem('uips_user');
    localStorage.removeItem('uips_token');
    setUser(null);
    setAuthToken(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated: !!user, 
      isLoading, 
      login,
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

