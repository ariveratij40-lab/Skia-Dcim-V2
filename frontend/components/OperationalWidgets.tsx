'use client';

import React from 'react';
import {
  TrendingUp, AlertTriangle, Clock, Activity,
  Zap, Thermometer, Wifi, HardDrive,
  ArrowUp, ArrowDown, Minus
} from 'lucide-react';

interface OperationalWidgetsProps {
  darkMode: boolean;
}

export default function OperationalWidgets({ darkMode }: OperationalWidgetsProps) {
  const cardBg = darkMode
    ? 'bg-white/40 border-[#E8EBF4]/50'
    : 'bg-white/40 border-blue-100/20';

  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className="space-y-6">
      
      {/* Top Row: Health Score & Critical Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Health Score */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Health Score</h3>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                94.2%
              </p>
              <p className={`text-xs mt-2 ${textMuted}`}>Infraestructura operativa</p>
            </div>
            <div className="flex-1 h-16 bg-gradient-to-t from-green-500/30 to-green-500/10 rounded-lg relative">
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-green-500 to-transparent rounded-lg opacity-60"></div>
            </div>
          </div>
        </div>

        {/* Critical Alerts */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Alertas Críticas</h3>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-sm ${textMuted}`}>Críticas</span>
              <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm font-bold">3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-sm ${textMuted}`}>Advertencias</span>
              <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-bold">7</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-sm ${textMuted}`}>Informativas</span>
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold">12</span>
            </div>
          </div>
        </div>

        {/* SLA Status */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Estado SLA</h3>
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">Uptime</span>
                <span className="text-sm font-bold text-green-400">99.98%</span>
              </div>
              <div className="w-full h-2 bg-[#F1F4FB]/50 rounded-full overflow-hidden">
                <div className="h-full w-11/12 bg-gradient-to-r from-green-500 to-emerald-400"></div>
              </div>
            </div>
            <p className={`text-xs ${textMuted}`}>Última vez: hace 2 horas</p>
          </div>
        </div>
      </div>

      {/* Middle Row: Mini Topology & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Mini Topology */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <h3 className="text-sm font-semibold mb-4">Topología de Infraestructura</h3>
          <div className="space-y-3">
            {[
              { name: 'Data Center Principal', status: 'online', devices: 156 },
              { name: 'Backup Site', status: 'online', devices: 48 },
              { name: 'Edge Node 1', status: 'online', devices: 12 },
              { name: 'Edge Node 2', status: 'warning', devices: 8 },
            ].map((site, idx) => (
              <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${
                darkMode ? 'bg-[#F1F4FB]/30 hover:bg-[#F1F4FB]/50' : 'bg-blue-50/30 hover:bg-blue-100/30'
              } transition-colors`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    site.status === 'online' ? 'bg-green-500' : 'bg-yellow-500'
                  } animate-pulse`}></div>
                  <div>
                    <p className="text-sm font-medium">{site.name}</p>
                    <p className={`text-xs ${textMuted}`}>{site.devices} dispositivos</p>
                  </div>
                </div>
                <Wifi className={`w-4 h-4 ${site.status === 'online' ? 'text-green-500' : 'text-yellow-500'}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <h3 className="text-sm font-semibold mb-4">Actividad Reciente</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {[
              { action: 'Servidor apagado', target: 'PROD-DB-02', time: 'hace 5 min', type: 'warning' },
              { action: 'Alerta de temperatura', target: 'Rack-A-12', time: 'hace 12 min', type: 'alert' },
              { action: 'Backup completado', target: 'Storage-01', time: 'hace 1 hora', type: 'success' },
              { action: 'Mantenimiento iniciado', target: 'Switch-Core-01', time: 'hace 2 horas', type: 'info' },
              { action: 'Capacidad crítica', target: 'SAN-Pool-03', time: 'hace 3 horas', type: 'alert' },
            ].map((activity, idx) => (
              <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${
                darkMode ? 'bg-[#F1F4FB]/30' : 'bg-blue-50/30'
              }`}>
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  activity.type === 'alert' ? 'bg-red-500' :
                  activity.type === 'warning' ? 'bg-yellow-500' :
                  activity.type === 'success' ? 'bg-green-500' :
                  'bg-blue-500'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.action}</p>
                  <p className={`text-xs ${textMuted} truncate`}>{activity.target}</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Resource Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CPU Usage */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">CPU</span>
            <Zap className="w-4 h-4 text-yellow-500" />
          </div>
          <p className="text-3xl font-bold">72%</p>
          <div className="mt-3 w-full h-2 bg-[#F1F4FB]/50 rounded-full overflow-hidden">
            <div className="h-full w-3/4 bg-gradient-to-r from-yellow-500 to-orange-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-yellow-500">
            <ArrowUp className="w-3 h-3" />
            <span>+5% vs hace 1h</span>
          </div>
        </div>

        {/* Memory Usage */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Memoria</span>
            <HardDrive className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-3xl font-bold">58%</p>
          <div className="mt-3 w-full h-2 bg-[#F1F4FB]/50 rounded-full overflow-hidden">
            <div className="h-full w-7/12 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-blue-500">
            <Minus className="w-3 h-3" />
            <span>-2% vs hace 1h</span>
          </div>
        </div>

        {/* Temperature */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Temperatura</span>
            <Thermometer className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-3xl font-bold">38°C</p>
          <div className="mt-3 w-full h-2 bg-[#F1F4FB]/50 rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-gradient-to-r from-green-500 to-emerald-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-green-500">
            <ArrowDown className="w-3 h-3" />
            <span>-1°C vs hace 1h</span>
          </div>
        </div>

        {/* Network I/O */}
        <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Red</span>
            <Wifi className="w-4 h-4 text-cyan-500" />
          </div>
          <p className="text-3xl font-bold">2.4Gbps</p>
          <div className="mt-3 w-full h-2 bg-[#F1F4FB]/50 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-gradient-to-r from-cyan-500 to-blue-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-cyan-500">
            <ArrowUp className="w-3 h-3" />
            <span>+12% vs hace 1h</span>
          </div>
        </div>
      </div>

      {/* Bottom: Events Timeline */}
      <div className={`${cardBg} backdrop-blur-xl rounded-xl border p-6 shadow-lg`}>
        <h3 className="text-sm font-semibold mb-4">Timeline de Eventos</h3>
        <div className="space-y-4">
          {[
            { time: '20:45', event: 'Alerta de CPU elevada en PROD-APP-03', severity: 'high' },
            { time: '20:30', event: 'Sincronización de réplica completada', severity: 'low' },
            { time: '20:15', event: 'Backup incremental iniciado', severity: 'low' },
            { time: '20:00', event: 'Cambio de configuración en Switch-Core-01', severity: 'medium' },
          ].map((item, idx) => (
            <div key={idx} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${
                  item.severity === 'high' ? 'bg-red-500' :
                  item.severity === 'medium' ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}></div>
                {idx < 3 && <div className="w-0.5 h-8 bg-[#F1F4FB]/30 mt-2"></div>}
              </div>
              <div className="flex-1 pt-0.5">
                <p className={`text-xs font-semibold ${
                  item.severity === 'high' ? 'text-red-400' :
                  item.severity === 'medium' ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {item.time}
                </p>
                <p className="text-sm mt-1">{item.event}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
