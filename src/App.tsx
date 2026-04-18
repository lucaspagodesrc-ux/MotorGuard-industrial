import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DashboardView from './components/DashboardView';
import { View } from './types';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6">
          <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full border border-red-100">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Algo deu errado</h2>
            <p className="text-on-surface-variant mb-6">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>
            <div className="bg-red-50 p-4 rounded-lg mb-6 overflow-auto max-h-40">
              <code className="text-xs text-red-800">
                {this.state.error?.message}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-container transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
