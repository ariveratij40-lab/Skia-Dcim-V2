'use client';

import React, { useState } from 'react';
import { 
  Menu, X, Moon, Sun, LogOut, ChevronDown, 
  LayoutDashboard, Building2, Settings, Package, 
  AlertCircle, TrendingUp, Zap, Activity
} from 'lucide-react';

interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: { count: number; color: 'red' | 'yellow' | 'blue' };
  children?: SidebarItem[];
}

const iconMap: { [key: string]: any } = {
  LayoutDashboard, Building2, Settings, Package,
  AlertCircle, TrendingUp, Zap, Activity
};

interface SidebarPremiumProps {
  items: SidebarItem[];
  onLogout: () => void;
  onThemeToggle: () => void;
  darkMode: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export default function SidebarPremium({
  items,
  onLogout,
  onThemeToggle,
  darkMode,
  isOpen,
  onToggle
}: SidebarPremiumProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState('dashboard');

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const bgClass = darkMode 
    ? 'bg-slate-950/40 backdrop-blur-2xl border-slate-800/50' 
    : 'bg-white/40 backdrop-blur-2xl border-blue-100/20';

  const textClass = darkMode ? 'text-gray-300' : 'text-gray-700';
  const hoverClass = darkMode 
    ? 'hover:bg-slate-800/50 hover:text-white' 
    : 'hover:bg-blue-50/50 hover:text-blue-900';

  return (
    <div className={`${isOpen ? 'w-72' : 'w-24'} transition-all duration-300 flex flex-col ${bgClass} border-r h-screen sticky top-0 z-40`}>
      
      {/* Header con Logo */}
      <div className={`p-6 flex items-center justify-between border-b ${darkMode ? 'border-slate-800/50' : 'border-blue-100/20'}`}>
        <div className="flex items-center gap-3">
          {/* Logo SKIA */}
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
            <svg viewBox="0 0 100 100" className="w-7 h-7 text-white">
              <path d="M50 10 L80 30 L80 70 Q80 85 65 90 L35 90 Q20 85 20 70 L20 30 Z" fill="currentColor" opacity="0.9"/>
              <path d="M50 20 L70 35 L70 65 Q70 75 60 80 L40 80 Q30 75 30 65 L30 35 Z" fill="white" opacity="0.3"/>
            </svg>
          </div>
          {isOpen && (
            <div>
              <p className="font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-400 bg-clip-text text-transparent">SKIA</p>
              <p className="text-xs text-gray-500">Enterprise</p>
            </div>
          )}
        </div>
        {isOpen && (
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-all ${hoverClass}`}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-400 scrollbar-track-transparent">
        {items.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const hasChildren = item.children && item.children.length > 0;
          const isExpanded = expandedItems.has(item.id);
          const isActive = activeItem === item.id;

          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  setActiveItem(item.id);
                  if (hasChildren) toggleExpanded(item.id);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group relative ${
                  isActive
                    ? darkMode
                      ? 'bg-blue-600/30 text-blue-300 shadow-lg shadow-blue-500/20'
                      : 'bg-blue-100/50 text-blue-900 shadow-lg shadow-blue-400/20'
                    : hoverClass
                }`}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-cyan-400 rounded-r-lg"></div>
                )}

                <Icon className={`w-5 h-5 flex-shrink-0 transition-all ${isActive ? 'scale-110' : ''}`} />

                {isOpen && (
                  <>
                    <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                    
                    {/* Badge */}
                    {item.badge && (
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        item.badge.color === 'red' ? 'bg-red-500/20 text-red-400' :
                        item.badge.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {item.badge.count}
                      </span>
                    )}

                    {/* Chevron */}
                    {hasChildren && (
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    )}
                  </>
                )}
              </button>

              {/* Submenu */}
              {isOpen && hasChildren && isExpanded && (
                <div className="ml-4 mt-1 space-y-1 border-l border-blue-400/20 pl-3">
                  {item.children!.map((child) => {
                    const ChildIcon = iconMap[child.icon] || Package;
                    return (
                      <button
                        key={child.id}
                        onClick={() => setActiveItem(child.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                          activeItem === child.id
                            ? darkMode
                              ? 'bg-blue-600/20 text-blue-300'
                              : 'bg-blue-50/50 text-blue-900'
                            : hoverClass
                        }`}
                      >
                        <ChildIcon className="w-4 h-4" />
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`border-t ${darkMode ? 'border-slate-800/50' : 'border-blue-100/20'} p-3 space-y-2`}>
        <button
          onClick={onThemeToggle}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${hoverClass}`}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {isOpen && <span className="text-sm font-medium">{darkMode ? 'Claro' : 'Oscuro'}</span>}
        </button>

        <button
          onClick={onLogout}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
            darkMode
              ? 'hover:bg-red-900/20 text-red-400 hover:text-red-300'
              : 'hover:bg-red-50/50 text-red-600 hover:text-red-700'
          }`}
        >
          <LogOut className="w-5 h-5" />
          {isOpen && <span className="text-sm font-medium">Salir</span>}
        </button>
      </div>

      {/* Toggle Button (cuando está cerrado) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className={`m-3 p-2 rounded-lg transition-all ${hoverClass}`}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
