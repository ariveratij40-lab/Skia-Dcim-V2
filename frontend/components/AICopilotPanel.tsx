'use client';

import React, { useState } from 'react';
import {
  Sparkles, Send, AlertCircle, TrendingUp,
  Lightbulb, Zap, X, MessageCircle
} from 'lucide-react';

interface AICopilotPanelProps {
  darkMode: boolean;
  onClose: () => void;
}

export default function AICopilotPanel({ darkMode, onClose }: AICopilotPanelProps) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: 'Hola, soy SKIA AI. Puedo ayudarte a optimizar tu infraestructura, analizar anomalías y proporcionar recomendaciones. ¿Qué necesitas?'
    }
  ]);
  const [input, setInput] = useState('');

  const bgClass = darkMode
    ? 'bg-slate-900 border-slate-800'
    : 'bg-white border-blue-100/20';

  const insights = [
    {
      type: 'anomaly',
      title: 'Anomalía Detectada',
      description: 'Patrón inusual en consumo de CPU en PROD-DB-02',
      severity: 'high',
      icon: AlertCircle
    },
    {
      type: 'recommendation',
      title: 'Recomendación',
      description: 'Considera migrar carga de trabajo a Rack-B para balancear temperatura',
      severity: 'medium',
      icon: Lightbulb
    },
    {
      type: 'optimization',
      title: 'Oportunidad de Optimización',
      description: 'Consolidar 3 VMs subutilizadas podría ahorrar 15% de energía',
      severity: 'low',
      icon: Zap
    }
  ];

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    
    // Agregar mensaje del usuario inmediatamente
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      // Llamar a la API del backend
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Incluir cookies de sesión
        body: JSON.stringify({
          messages: [
            ...messages,
            { role: 'user', content: userMessage }
          ],
          model: 'groq'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Agregar respuesta del asistente
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (error) {
      console.error('Error en chat IA:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '❌ Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta de nuevo.' 
      }]);
    }
  };

  return (
    <div className={`fixed right-0 top-0 h-screen w-96 ${bgClass} border-l shadow-2xl z-50 flex flex-col transition-all duration-300`}>
      
      {/* Header */}
      <div className={`p-4 border-b ${darkMode ? 'border-slate-800' : 'border-blue-100/20'} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-semibold">SKIA AI</h3>
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded-lg transition-all ${
            darkMode ? 'hover:bg-slate-800' : 'hover:bg-blue-50'
          }`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Insights Section */}
      <div className={`p-4 border-b ${darkMode ? 'border-slate-800' : 'border-blue-100/20'}`}>
        <p className="text-xs font-semibold mb-3 text-purple-400">Insights Inteligentes</p>
        <div className="space-y-2">
          {insights.map((insight, idx) => {
            const Icon = insight.icon;
            return (
              <div
                key={idx}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  insight.severity === 'high'
                    ? darkMode
                      ? 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/15'
                      : 'bg-red-50/50 border border-red-200/30 hover:bg-red-100/50'
                    : insight.severity === 'medium'
                    ? darkMode
                      ? 'bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/15'
                      : 'bg-yellow-50/50 border border-yellow-200/30 hover:bg-yellow-100/50'
                    : darkMode
                    ? 'bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/15'
                    : 'bg-blue-50/50 border border-blue-200/30 hover:bg-blue-100/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    insight.severity === 'high' ? 'text-red-500' :
                    insight.severity === 'medium' ? 'text-yellow-500' :
                    'text-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{insight.title}</p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {insight.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white'
                  : darkMode
                  ? 'bg-slate-800 text-gray-200'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="text-sm">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className={`p-4 border-t ${darkMode ? 'border-slate-800' : 'border-blue-100/20'}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Pregunta sobre tu infraestructura..."
            className={`flex-1 px-3 py-2 rounded-lg outline-none text-sm transition-all ${
              darkMode
                ? 'bg-slate-800 border border-slate-700 focus:border-purple-500 text-white'
                : 'bg-gray-100 border border-gray-300 focus:border-purple-500 text-gray-900'
            }`}
          />
          <button
            onClick={handleSend}
            className="p-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:shadow-purple-500/30 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
