import { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DashboardView from './components/DashboardView';
import ErrorBoundary from './components/ErrorBoundary';
import { View } from './types';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function App() {
  const [view, setView] = useState<View>('login');
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // Force logout on mount to ensure no session persistence
    const forceLogout = async () => {
      try {
        await signOut(auth);
      } catch (e) {
        console.error("Error forcing logout:", e);
      }
    };
    forceLogout();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Ensure user document exists in Firestore
        try {
          const userDoc = doc(db, 'users', user.uid);
          const snap = await getDoc(userDoc);
          if (!snap.exists()) {
            await setDoc(userDoc, {
              email: user.email,
              displayName: user.displayName,
              role: 'user',
              createdAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.error("Error checking/creating user doc:", e);
        }
        setView('overview');
      } else {
        setView('login');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = () => {
    setView('overview');
  };

  const handleLogout = () => {
    setView('login');
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-industrial-mesh">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        {view === 'login' ? (
          <LoginPage onLogin={handleLogin} />
        ) : (
          <>
            <TopBar onLogout={handleLogout} />
            <div className="flex flex-1 pt-16">
              <Sidebar currentView={view} onViewChange={setView} />
              <DashboardView currentView={view} />
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
