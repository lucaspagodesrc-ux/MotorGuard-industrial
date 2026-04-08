import { 
  LayoutDashboard, 
  Factory
} from 'lucide-react';
import { View } from '../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export default function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const menuItems = [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' as View },
  ];

  return (
    <aside className="hidden lg:flex flex-col pt-8 pb-4 h-[calc(100vh-64px)] w-64 bg-slate-100 sticky top-16 border-r border-outline-variant/10">
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center">
            <Factory className="text-white w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-primary tracking-tight">CSN</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Monitoramento técnico</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <div 
            key={item.label}
            onClick={() => onViewChange(item.id)}
            className={`mx-2 flex items-center px-4 py-3 gap-3 cursor-pointer rounded-lg transition-all ${
              currentView === item.id 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-slate-500 hover:bg-slate-200 hover:translate-x-1'
            }`}
          >
            <item.icon className={`w-5 h-5 ${currentView === item.id ? 'fill-primary/10' : ''}`} />
            <span className="text-sm font-medium">{item.label}</span>
          </div>
        ))}
      </nav>

    </aside>
  );
}
