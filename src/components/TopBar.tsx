import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

interface TopBarProps {
  onLogout: () => void;
}

export default function TopBar({ onLogout }: TopBarProps) {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-gradient-to-r from-[#002045] to-[#1a365d] shadow-lg shadow-black/20 flex justify-between items-center px-8 h-16">
      <div className="flex items-center gap-8">
        <h1 className="text-xl font-bold tracking-tighter text-white uppercase antialiased">MotorGuard Industrial</h1>
        <nav className="hidden md:flex gap-6 items-center h-full">
          <a className="text-white border-b-2 border-white pb-1 font-semibold transition-all" href="#">Dashboard</a>
        </nav>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="h-8 w-[1px] bg-white/20 mx-2"></div>
        <button 
          onClick={handleLogout}
          className="text-slate-300 hover:text-white text-sm font-medium transition-colors active:scale-95"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
