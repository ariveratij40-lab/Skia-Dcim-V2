'use client';

import React, { useState } from 'react';
import {
  Search, Bell, Zap, Settings, ChevronDown,
  Building2, MapPin, Sparkles, AlertCircle
} from 'lucide-react';

interface TopbarProps {
  tenant?: { id: string; name: string };
  branch?: { id: string; name: string };
  user?: { name: string; email: string };
  darkMode: boolean;
  onSidebarToggle: () => void;
}

export default function TopbarEnterprise({
  tenant,
  branch,
  user,
  darkMode,
  onSidebarToggle
}: TopbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);

  const bgClass = darkMode
    ? 'bg-slate-900/60 border-slate-800/50'
    : 'bg-white/60 border-blue-100/20';

  const mockNotifications = [
    { id: 1, type: 'alert', title: 'Alerta Crítica', message: '3 racks con temperatura elevada', time: 'hace 2 min', color: 'red' },
    { id: 2, type: 'warning', title: 'Advertencia', message: 'Capacidad de PDU al 85%', time: 'hace 15 min', color: 'yellow' },
    { id: 3, type: 'info', title: 'Información', message: 'Mantenimiento programado completado', time: 'hace 1 hora', color: 'blue' },
  ];

  return (
    <div className={`${bgClass} backdrop-blur-xl border-b sticky top-0 z-30 px-6 py-4`}>
      <div className="flex items-center justify-between gap-4">
        
        {/* Left: Tenant & Branch Selector */}
        <div className="flex items-center gap-3">
          {/* Tenant */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            darkMode ? 'bg-slate-800/50 hover:bg-slate-700/50' : 'bg-blue-50/50 hover:bg-blue-100/50'
          } cursor-pointer transition-all group`}>
            <Building2 className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">{tenant?.name || 'Tenant'}</span>
            <ChevronDown className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-all" />
          </div>

          {/* Branch */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            darkMode ? 'bg-slate-800/50 hover:bg-slate-700/50' : 'bg-blue-50/50 hover:bg-blue-100/50'
          } cursor-pointer transition-all group`}>
            <MapPin className="w-4 h-4 text-cyan-500" />
            <span className="text-sm font-medium">{branch?.name || 'Branch'}</span>
            <ChevronDown className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-all" />
          </div>
        </div>

        {/* Center: Global Search */}
        <div className="flex-1 max-w-md">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            searchFocus
              ? darkMode
                ? 'bg-slate-800 ring-2 ring-blue-500/50'
                : 'bg-white ring-2 ring-blue-400/50'
              : darkMode
              ? 'bg-slate-800/30'
              : 'bg-gray-100/30'
          }`}>
            <Search className="w-4 h-4 opacity-50" />
            <input
              type="text"
              placeholder="Buscar activos, alertas, tickets..."
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              className={`flex-1 bg-transparent outline-none text-sm placeholder-gray-400 ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          
          {/* AI Copilot Button */}
          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              showAIPanel
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30'
                : darkMode
                ? 'bg-slate-800/50 hover:bg-slate-700/50 text-purple-400 hover:text-purple-300'
                : 'bg-purple-50/50 hover:bg-purple-100/50 text-purple-600 hover:text-purple-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium hidden sm:inline">AI</span>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative p-2 rounded-lg transition-all ${
                darkMode
                  ? 'hover:bg-slate-800/50'
                  : 'hover:bg-blue-50/50'
              }`}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            </button>

            {/* Notifications Panel */}
            {showNotifications && (
              <div className={`absolute right-0 mt-2 w-96 rounded-lg shadow-2xl border ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-blue-100/20'
              } overflow-hidden`}>
                <div className={`p-4 border-b ${darkMode ? 'border-slate-800' : 'border-blue-100/20'}`}>
                  <h3 className="font-semibold text-sm">Notificaciones</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {mockNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-4 border-b ${darkMode ? 'border-slate-800/50 hover:bg-slate-800/30' : 'border-blue-50 hover:bg-blue-50/30'} transition-colors cursor-pointer`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          notif.color === 'red' ? 'bg-red-500' :
                          notif.color === 'yellow' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }`}></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{notif.title}</p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {notif.message}
                          </p>
                          <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                            {notif.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <button className={`p-2 rounded-lg transition-all ${
            darkMode
              ? 'hover:bg-slate-800/50'
              : 'hover:bg-blue-50/50'
          }`}>
            <Settings className="w-5 h-5" />
          </button>

          {/* User Profile */}
          <div className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
            darkMode ? 'bg-slate-800/50' : 'bg-blue-50/50'
          } cursor-pointer hover:opacity-80 transition-all`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium">{user?.name || 'User'}</p>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {user?.email || 'user@example.com'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Badge */}
      <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-600 border border-green-500/30">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        Production
      </div>
    </div>
  );
}
