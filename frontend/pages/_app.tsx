import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import axios from 'axios';
import '../styles/globals.css';

// Configurar axios globalmente para enviar cookies en TODAS las peticiones
// Sin esto, la cookie session_token no se envía y el backend responde 401
axios.defaults.withCredentials = true;

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    }
  }, []);

  return <Component {...pageProps} />;
}
