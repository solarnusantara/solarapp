/// <reference types="vite/client" />

interface Window {
  SONUS_USER?: {
    id: string;
    nama: string;
    email: string;
    role: string;
    divisi?: string;
  };
  GOOGLE_MAPS_API_KEY?: string;
  google?: any;
}
