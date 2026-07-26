'use client';

import React, { useState } from 'react';
import {
  Search, Bell, Settings, ChevronDown,
  Building2, MapPin, Sparkles
} from 'lucide-react';

interface TopbarMinimalProps {
  tenant?: { id: string; name: string };
  branch?: { id: string; name: string };
  user?: { name: string; email: string };
  darkMode: boolean;
}

export default function TopbarMinimal({
  tenant,
  branch,
  user,
  darkMode
}: TopbarMinimalProps) {
  const [showNotifications, setShowNotifications] = useState(false);

  const bgClass = darkMode
    ? 'bg-slate-950/50 border-slate-800/20'
    : 'bg-white/30 border-blue-100/10';

  const mockNotifications = [
    { id: 1, type: 'alert', title: 'Alerta', message: '3 racks con temperatura elevada', time: 'hace 2 min' },
    { id: 2, type: 'warning', title: 'Advertencia', message: 'Capacidad de PDU al 85%', time: 'hace 15 min' },
  ];

  return (
    <div className={`${bgClass} backdrop-blur-md border-b sticky top-0 z-30 px-8 py-4`}>
      <div className="flex items-center justify-between gap-6">
        
        {/* Left: Selectors */}
        <div className="flex items-center gap-4">
          {/* Tenant */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-blue-50/30'
          } cursor-pointer group`}>
            <Building2 className="w-4 h-4 text-blue-500 opacity-60" />
            <span className={`text-sm font-light ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {tenant?.name || 'Tenant'}
            </span>
          </div>

          {/* Branch */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-blue-50/30'
          } cursor-pointer group`}>
            <MapPin className="w-4 h-4 text-cyan-500 opacity-60" />
            <span className={`text-sm font-light ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {branch?.name || 'Branch'}
            </span>
          </div>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-md">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            darkMode
              ? 'bg-slate-800/20 hover:bg-slate-800/40'
              : 'bg-gray-100/30 hover:bg-gray-100/50'
          }`}>
            <Search className="w-4 h-4 opacity-40" />
            <input
              type="text"
              placeholder="Buscar..."
              className={`flex-1 bg-transparent outline-none text-sm placeholder-gray-400 font-light ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          
          {/* AI Button */}
          <button className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            darkMode
              ? 'hover:bg-purple-600/20 text-purple-400'
              : 'hover:bg-purple-50/50 text-purple-600'
          }`}>
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative p-2 rounded-lg transition-all ${
                darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-blue-50/30'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
            </button>

            {showNotifications && (
              <div className={`absolute right-0 mt-2 w-80 rounded-lg shadow-xl border ${
                darkMode
                  ? 'bg-slate-900/80 border-slate-800/50'
                  : 'bg-white/80 border-blue-100/20'
              } backdrop-blur-md overflow-hidden`}>
                <div className={`p-3 border-b ${darkMode ? 'border-slate-800/30' : 'border-blue-100/20'}`}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Notificaciones</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {mockNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 border-b ${darkMode ? 'border-slate-800/20 hover:bg-slate-800/20' : 'border-blue-50/30 hover:bg-blue-50/20'} transition-colors cursor-pointer`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                          notif.type === 'alert' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{notif.title}</p>
                          <p className={`text-xs mt-0.5 opacity-60 line-clamp-2`}>
                            {notif.message}
                          </p>
                          <p className="text-xs mt-1 opacity-40">{notif.time}</p>
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
            darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-blue-50/30'
          }`}>
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            darkMode ? 'bg-slate-800/20' : 'bg-blue-50/30'
          } cursor-pointer hover:opacity-80 transition-all`}>
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <span className="text-xs font-light opacity-70">{user?.name || 'User'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
