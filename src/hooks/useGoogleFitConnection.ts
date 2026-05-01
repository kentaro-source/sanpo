import { useEffect, useState } from 'react';
import {
  signIn as gfSignIn,
  reAuth as gfReAuth,
  signOut as gfSignOut,
  isSignedIn,
} from '../services/googleFit';

const EVER_CONSENTED_KEY = 'sanpo-google-fit-ever-consented';

function hasEverConsented(): boolean {
  try {
    if (localStorage.getItem(EVER_CONSENTED_KEY) === '1') return true;
    // Backfill: any token data (even expired) means user already consented
    // on this device in a prior session before this flag existed.
    if (localStorage.getItem('sanpo-google-fit-token')) {
      localStorage.setItem(EVER_CONSENTED_KEY, '1');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function setEverConsented(): void {
  try {
    localStorage.setItem(EVER_CONSENTED_KEY, '1');
  } catch {
    // ignore
  }
}

function clearEverConsented(): void {
  try {
    localStorage.removeItem(EVER_CONSENTED_KEY);
  } catch {
    // ignore
  }
}

let connectedGlobal = isSignedIn() || hasEverConsented();
const listeners = new Set<(v: boolean) => void>();

function setConnectedGlobal(v: boolean) {
  if (connectedGlobal === v) return;
  connectedGlobal = v;
  listeners.forEach((l) => l(v));
}

export function useGoogleFitConnection() {
  const [connected, setConnected] = useState(connectedGlobal);

  useEffect(() => {
    listeners.add(setConnected);
    setConnected(connectedGlobal);
    return () => {
      listeners.delete(setConnected);
    };
  }, []);

  return {
    connected,
    /** True if user has actually got a fresh token right now (not just ever-consented). */
    hasFreshToken: () => isSignedIn(),
    signIn: async () => {
      await gfSignIn();
      setEverConsented();
      setConnectedGlobal(true);
    },
    /**
     * One-tap re-auth (no consent screen). Use when the token expired but
     * the user has previously consented on this device.
     */
    reAuth: async () => {
      await gfReAuth();
      setEverConsented();
      setConnectedGlobal(true);
    },
    signOut: () => {
      gfSignOut();
      clearEverConsented();
      setConnectedGlobal(false);
    },
    setConnected: setConnectedGlobal,
  };
}
