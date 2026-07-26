'use client';

import React from 'react';
import { useSkiaContext, useCurrentUser } from '@/providers/SkiaContextProvider';
import { Menu, Search, Bell, Settings, LogOut, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

interface TopbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenNotifications: () => void;
}

export default function Topbar({
  sidebarOpen,
  onToggleSidebar,
  onOpenCommandPalette,
  onOpenNotifications,
}: TopbarProps) {
  const { currentUser, currentTenant, currentBranch } = useSkiaContext();
  const [darkMode, setDarkMode] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Menu size={20} className="text-slate-600 dark:text-slate-400" />
        </button>

        <div className="hidden md:flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span>{currentTenant?.name}</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span>{currentBranch?.name}</span>
        </div>
      </div>

      {/* Center Section - Search */}
      <div className="flex-1 flex justify-center px-4">
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors w-full max-w-xs"
        >
          <Search size={16} className="text-slate-500 dark:text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Buscar... (Cmd+K)</span>
        </button>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Bell size={20} className="text-slate-600 dark:text-slate-400" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          {darkMode ? (
            <Sun size={20} className="text-slate-600 dark:text-slate-400" />
          ) : (
            <Moon size={20} className="text-slate-600 dark:text-slate-400" />
          )}
        </button>

        {/* Settings */}
        <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <Settings size={20} className="text-slate-600 dark:text-slate-400" />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {currentUser?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="hidden md:inline text-sm font-medium text-slate-700 dark:text-slate-300">
              {currentUser?.name}
            </span>
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {currentUser?.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {currentUser?.email}
                </p>
              </div>

              <button className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
                <Settings size={16} />
                Configuración
              </button>

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
