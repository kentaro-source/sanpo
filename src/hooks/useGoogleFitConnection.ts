import { useEffect, useState } from 'react';
import {
  signIn as gfSignIn,
  silentSignIn,
  signOut as gfSignOut,
  isSignedIn,
} from '../services/googleFit';

let initialized = false;
let connectedGlobal = isSignedIn();
const listeners = new Set<(v: boolean) => void>();

function setConnectedGlobal(v: boolean) {
  if (connectedGlobal === v) return;
  connectedGlobal = v;
  listeners.forEach((l) => l(v));
}

async function initOnce() {
  if (initialized) return;
  initialized = true;
  if (connectedGlobal) return;
  const token = await silentSignIn();
  if (token) setConnectedGlobal(true);
}

export function useGoogleFitConnection() {
  const [connected, setConnected] = useState(connectedGlobal);

  useEffect(() => {
    listeners.add(setConnected);
    setConnected(connectedGlobal);
    initOnce();
    return () => {
      listeners.delete(setConnected);
    };
  }, []);

  return {
    connected,
    signIn: async () => {
      await gfSignIn();
      setConnectedGlobal(true);
    },
    signOut: () => {
      gfSignOut();
      setConnectedGlobal(false);
    },
    setConnected: setConnectedGlobal,
  };
}
