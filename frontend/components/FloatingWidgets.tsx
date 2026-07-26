'use client';

import React from 'react';
import {
  TrendingUp, AlertTriangle, Clock, Activity,
  Zap, Thermometer, Wifi, HardDrive,
  ArrowUp, ArrowDown, Minus, BarChart3
} from 'lucide-react';

interface FloatingWidgetsProps {
  darkMode: boolean;
}

export default function FloatingWidgets({ darkMode }: FloatingWidgetsProps) {
  const cardBg = darkMode
    ? 'bg-[#EEF0F8]/40 border-[#E8EBF4]/20'
    : 'bg-white/40 border-blue-100/10';

  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-600';

  // Widgets con rotación y offset para efecto flotante
  const widgets = [
    {
      id: 1,
      title: 'Health Score',
      value: '94.2%',
      subtitle: 'Infraestructura operativa',
      icon: TrendingUp,
      color: 'from-green-400 to-emerald-400',
      rotate: '-2deg',
      translateY: '0px',
      width: 'w-72'
    },
    {
      id: 2,
      title: 'Alertas Críticas',
      value: '3',
      subtitle: 'Requieren atención',
      icon: AlertTriangle,
      color: 'from-red-400 to-pink-400',
      rotate: '1deg',
      translateY: '40px',
      width: 'w-64'
    },
    {
      id: 3,
      title: 'SLA Status',
      value: '99.98%',
      subtitle: 'Uptime este mes',
      icon: Clock,
      color: 'from-blue-400 to-cyan-400',
      rotate: '-1deg',
      translateY: '-20px',
      width: 'w-72'
    },
    {
      id: 4,
      title: 'CPU Usage',
      value: '72%',
      subtitle: 'Promedio global',
      icon: Zap,
      color: 'from-yellow-400 to-orange-400',
      rotate: '2deg',
      translateY: '60px',
      width: 'w-64'
    },
    {
      id: 5,
      title: 'Temperatura',
      value: '38°C',
      subtitle: 'Promedio de racks',
      icon: Thermometer,
      color: 'from-orange-400 to-red-400',
      rotate: '-1.5deg',
      translateY: '20px',
      width: 'w-72'
    },
    {
      id: 6,
      title: 'Red I/O',
      value: '2.4Gbps',
      subtitle: 'Throughput actual',
      icon: Wifi,
      color: 'from-cyan-400 to-blue-400',
      rotate: '1.5deg',
      translateY: '-40px',
      width: 'w-64'
    }
  ];

  return (
    <div className="relative w-full h-auto min-h-screen p-8">
      {/* Grid de widgets flotantes */}
      <div className="relative w-full h-96">
        {widgets.map((widget, idx) => {
          const Icon = widget.icon;
          return (
            <div
              key={widget.id}
              className={`absolute ${widget.width} ${cardBg} backdrop-blur-lg rounded-2xl border p-6 shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer group`}
              style={{
                transform: `rotate(${widget.rotate}) translateY(${widget.translateY})`,
                left: `${(idx % 3) * 35}%`,
                top: `${Math.floor(idx / 3) * 180}px`,
                zIndex: idx
              }}
            >
              {/* Gradient accent */}
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${widget.color} rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity`}></div>

              {/* Content */}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-xs font-light uppercase tracking-wider opacity-60`}>
                    {widget.title}
                  </h3>
                  <Icon className={`w-4 h-4 bg-gradient-to-br ${widget.color} bg-clip-text text-transparent`} />
                </div>

                <p className={`text-3xl font-light mb-2 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {widget.value}
                </p>

                <p className={`text-xs ${textMuted} font-light`}>
                  {widget.subtitle}
                </p>

                {/* Mini chart */}
                <div className="mt-4 flex items-end gap-1 h-8">
                  {[65, 72, 68, 75, 80, 78, 72].map((val, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t-sm bg-gradient-to-t ${widget.color} opacity-40 hover:opacity-60 transition-opacity`}
                      style={{ height: `${(val / 100) * 100}%` }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="h-96"></div>

      {/* Bottom Section: Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
        
        {/* Metric Card 1 */}
        <div className={`${cardBg} backdrop-blur-lg rounded-2xl border p-6 shadow-lg hover:shadow-xl transition-all`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-light uppercase tracking-wider opacity-60">Memoria</span>
            <HardDrive className="w-4 h-4 text-blue-500 opacity-60" />
          </div>
          <p className="text-2xl font-light mb-3">58%</p>
          <div className="w-full h-1.5 bg-[#F1F4FB]/20 rounded-full overflow-hidden">
            <div className="h-full w-7/12 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-blue-500 opacity-70">
            <Minus className="w-3 h-3" />
            <span>-2% vs hace 1h</span>
          </div>
        </div>

        {/* Metric Card 2 */}
        <div className={`${cardBg} backdrop-blur-lg rounded-2xl border p-6 shadow-lg hover:shadow-xl transition-all`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-light uppercase tracking-wider opacity-60">Activos</span>
            <Activity className="w-4 h-4 text-green-500 opacity-60" />
          </div>
          <p className="text-2xl font-light mb-3">1,234</p>
          <div className="w-full h-1.5 bg-[#F1F4FB]/20 rounded-full overflow-hidden">
            <div className="h-full w-4/5 bg-gradient-to-r from-green-500 to-emerald-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-green-500 opacity-70">
            <ArrowUp className="w-3 h-3" />
            <span>+12 nuevos</span>
          </div>
        </div>

        {/* Metric Card 3 */}
        <div className={`${cardBg} backdrop-blur-lg rounded-2xl border p-6 shadow-lg hover:shadow-xl transition-all`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-light uppercase tracking-wider opacity-60">Racks</span>
            <BarChart3 className="w-4 h-4 text-orange-500 opacity-60" />
          </div>
          <p className="text-2xl font-light mb-3">42</p>
          <div className="w-full h-1.5 bg-[#F1F4FB]/20 rounded-full overflow-hidden">
            <div className="h-full w-3/4 bg-gradient-to-r from-orange-500 to-red-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-orange-500 opacity-70">
            <ArrowDown className="w-3 h-3" />
            <span>-1 offline</span>
          </div>
        </div>

        {/* Metric Card 4 */}
        <div className={`${cardBg} backdrop-blur-lg rounded-2xl border p-6 shadow-lg hover:shadow-xl transition-all`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-light uppercase tracking-wider opacity-60">Sucursales</span>
            <Activity className="w-4 h-4 text-pink-500 opacity-60" />
          </div>
          <p className="text-2xl font-light mb-3">3</p>
          <div className="w-full h-1.5 bg-[#F1F4FB]/20 rounded-full overflow-hidden">
            <div className="h-full w-full bg-gradient-to-r from-pink-500 to-rose-400"></div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-pink-500 opacity-70">
            <span>Todas operativas</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className={`${cardBg} backdrop-blur-lg rounded-2xl border p-6 shadow-lg mt-8`}>
        <h3 className="text-xs font-light uppercase tracking-wider opacity-60 mb-4">Actividad Reciente</h3>
        <div className="space-y-3">
          {[
            { action: 'Servidor apagado', target: 'PROD-DB-02', time: 'hace 5 min', severity: 'high' },
            { action: 'Alerta de temperatura', target: 'Rack-A-12', time: 'hace 12 min', severity: 'high' },
            { action: 'Backup completado', target: 'Storage-01', time: 'hace 1 hora', severity: 'low' },
          ].map((activity, idx) => (
            <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${
              darkMode ? 'bg-white/20 hover:bg-white/40' : 'bg-blue-50/20 hover:bg-blue-100/20'
            } transition-colors`}>
              <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                activity.severity === 'high' ? 'bg-red-500' : 'bg-green-500'
              }`}></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-light">{activity.action}</p>
                <p className={`text-xs mt-0.5 ${textMuted}`}>{activity.target} • {activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
