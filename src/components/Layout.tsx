import React from 'react';
import { Briefcase, Users, Upload, Mail, LayoutGrid, BarChart3, Wifi, WifiOff } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  wsConnected: boolean;
}

const navItems = [
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'positions', label: 'Positions', icon: Briefcase },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'email', label: 'Email', icon: Mail },
];

export function Layout({ children, currentPage, onNavigate, wsConnected }: LayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                <div className="bg-blue-600 p-2 rounded-lg">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <span className="ml-2.5 text-lg font-bold text-slate-800">HR Screening</span>
              </div>

              <div className="hidden md:flex space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === item.id || (currentPage === 'candidate-detail' && item.id === 'candidates')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-1.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center">
              <span
                title={wsConnected ? 'Real-time connected' : 'Reconnecting...'}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                  wsConnected
                    ? 'bg-green-50 text-green-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
