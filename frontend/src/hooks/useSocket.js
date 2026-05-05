import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../config';

export const useSocket = (userId) => {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem('uips_token');
    console.log("[Socket] Connecting with token:", token ? "Present" : "Missing");
    
    // Ensure API_BASE doesn't have a trailing slash for socket.io
    const socketUrl = API_BASE.replace(/\/$/, "");

    socketRef.current = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'], // Prioritize websocket
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { userId, token },
      query: { token }
    });

    socketRef.current.on('connect', () => {
      console.log('[Socket] Connected');
      setConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setConnected(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [userId]);

  return { socket: socketRef.current, connected };
};
