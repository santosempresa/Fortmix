import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { LayoutDashboard, ShoppingCart, Package, Database, FileText, Users, Settings, LogOut, Menu, X, Bell } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Dono', 'Gerente', 'Vendedor', 'Estoquista'] },
    { id: 'pdv', label: 'PDV', icon: ShoppingCart, roles: ['Dono', 'Gerente', 'Vendedor'], desktopOnly: true },
    { id: 'products', label: 'Produtos', icon: Package, roles: ['Dono', 'Gerente', 'Estoquista'] },
    { id: 'stock', label: 'Estoque', icon: Database, roles: ['Dono', 'Gerente', 'Estoquista'] },
    { id: 'reports', label: 'Relatórios', icon: FileText, roles: ['Dono', 'Gerente'] },
    { id: 'users', label: 'Usuários', icon: Users, roles: ['Dono'] },
    { id: 'audit', label: 'Auditoria', icon: Settings, roles: ['Dono'] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role || ''));

  return (
    <div className="min-h-screen flex flex-col">
      {/* Desktop Header */}
      <header className="hidden md:flex h-12 bg-white border-b border-slate-200 items-center px-6 sticky top-0 z-50">
        <div className="flex items-center gap-2 mr-8">
          <div className="w-6 h-6 bg-fortmix-red rounded flex items-center justify-center text-white font-bold text-xs">F</div>
          <span className="font-bold text-slate-800 tracking-tight">FORTMIX</span>
        </div>
        
        <nav className="flex h-full">
          {filteredMenu.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`px-4 h-full flex items-center gap-2 text-sm font-medium transition-colors relative ${
                activeTab === item.id ? 'text-fortmix-red' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <item.icon size={16} />
              {item.label}
              {activeTab === item.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-fortmix-red" />
              )}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <button className="text-slate-400 hover:text-slate-600">
            <Bell size={18} />
          </button>
          <div className="h-6 w-[1px] bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-800">{user?.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role}</p>
            </div>
            <button 
              onClick={logout}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="md:hidden h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-fortmix-red rounded flex items-center justify-center text-white font-bold text-xs">F</div>
          <span className="font-bold text-slate-800">FORTMIX</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-white z-40 pt-14">
          <nav className="p-4 flex flex-col gap-2">
            {filteredMenu.filter(i => !i.desktopOnly).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 p-3 rounded-md text-base font-medium ${
                  activeTab === item.id ? 'bg-red-50 text-fortmix-red' : 'text-slate-600'
                }`}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            ))}
            <button 
              onClick={logout}
              className="flex items-center gap-3 p-3 rounded-md text-base font-medium text-slate-600 mt-4 border-t border-slate-100"
            >
              <LogOut size={20} />
              Sair do Sistema
            </button>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-16 flex items-center justify-around z-50">
        {filteredMenu.filter(i => !i.desktopOnly).slice(0, 5).map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-1 ${
              activeTab === item.id ? 'text-fortmix-red' : 'text-slate-400'
            }`}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="md:hidden h-16" /> {/* Spacer for bottom nav */}
    </div>
  );
};
