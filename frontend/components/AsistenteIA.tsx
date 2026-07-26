import React, { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  X, Send, Sparkles, RefreshCw, ChevronDown,
  BarChart3, TrendingUp, AlertTriangle, Wifi,
  Server, Shield, Zap, FileSearch, Bot, User,
  Copy, Check, Loader2, Settings2
} from 'lucide-react'

// ==========================================
// Tipos
// ==========================================
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string
  timestamp: Date
  isStreaming?: boolean
}

interface QuickAction {
  icon: React.ReactNode
  label: string
  sublabel: string
  prompt: string
}

type ModelOption = 'groq' | 'gpt' | 'ollama'

interface AsistenteIAProps {
  userName?: string
  onClose: () => void
}

// ==========================================
// Acciones rápidas
// ==========================================
const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: <BarChart3 size={16} />,
    label: 'Resumen del sistema',
    sublabel: 'KPIs de infraestructura',
    prompt: 'Dame un resumen completo del estado actual de la infraestructura: racks, nodos, switches, UPS y tickets abiertos.'
  },
  {
    icon: <Shield size={16} />,
    label: 'Estado de normativa',
    sublabel: 'Fluke y Panduit',
    prompt: '¿Cuántos nodos no tienen prueba Fluke o certificado Panduit? Dame recomendaciones para regularizarlos.'
  },
  {
    icon: <AlertTriangle size={16} />,
    label: 'Tickets críticos',
    sublabel: 'Prioridades urgentes',
    prompt: '¿Cuáles son los tickets más urgentes o críticos que debo atender hoy?'
  },
  {
    icon: <TrendingUp size={16} />,
    label: 'Recomendaciones',
    sublabel: 'Mejoras sugeridas',
    prompt: 'Basándote en el estado actual de la infraestructura, ¿qué mejoras o acciones preventivas recomiendas?'
  },
  {
    icon: <Server size={16} />,
    label: 'Capacidad de racks',
    sublabel: 'Uso y disponibilidad',
    prompt: '¿Cómo está la capacidad de los racks? ¿Hay alguno con alta ocupación que deba revisar?'
  },
  {
    icon: <FileSearch size={16} />,
    label: 'Auditoría rápida',
    sublabel: 'Elementos sin documentar',
    prompt: '¿Qué elementos de infraestructura están sin documentar o tienen información incompleta?'
  }
]

const MODEL_LABELS: Record<ModelOption, { label: string; color: string; badge: string }> = {
  groq:   { label: 'Llama 3.3',    color: '#8B5CF6', badge: 'Groq · Rápido' },
  gpt:    { label: 'GPT-4.1-mini', color: '#10B981', badge: 'OpenAI' },
  ollama: { label: 'Llama 3.1',    color: '#F59E0B', badge: 'Local · Privado' }
}

// ==========================================
// Utilidades
// ==========================================
function generateId() {
  return Math.random().toString(36).substr(2, 9)
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Renderizar markdown básico
function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#1e293b;padding:1px 5px;border-radius:3px;font-size:0.85em">$1</code>')
    .replace(/^### (.*$)/gm, '<h3 style="font-size:0.95em;font-weight:700;margin:10px 0 4px">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 style="font-size:1em;font-weight:700;margin:10px 0 4px">$1</h2>')
    .replace(/^- (.*$)/gm, '<li style="margin:2px 0;padding-left:4px">$1</li>')
    .replace(/(<li[^]*?<\/li>)/g, '<ul style="padding-left:16px;margin:6px 0">$1</ul>')
    .replace(/\n/g, '<br/>')
}

// ==========================================
// Componente principal
// ==========================================
export default function AsistenteIA({ userName = 'Usuario', onClose }: AsistenteIAProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [model, setModel] = useState<ModelOption>('groq')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showQuickActions, setShowQuickActions] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus en el input al abrir
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setShowQuickActions(false)

    // Placeholder del asistente con streaming
    const assistantId = generateId()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      model,
      timestamp: new Date(),
      isStreaming: true
    }
    setMessages(prev => [...prev, assistantMsg])

    try {
      // Construir historial para la API
      const history = messages.map(m => ({
        role: m.role,
        content: m.content
      }))
      history.push({ role: 'user', content: text.trim() })

      abortRef.current = new AbortController()

      const response = await fetch('/api/ai/chat?stream=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: history, model }),
        signal: abortRef.current.signal
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Error al conectar con el asistente')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6))
                const delta = data?.choices?.[0]?.delta?.content || ''
                if (delta) {
                  fullContent += delta
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId
                      ? { ...m, content: fullContent }
                      : m
                  ))
                }
              } catch {}
            }
          }
        }
      }

      // Marcar como completado
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, isStreaming: false, content: fullContent || m.content }
          : m
      ))

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false, content: m.content + '\n\n*[Respuesta interrumpida]*' }
            : m
        ))
      } else {
        // Fallback sin streaming
        try {
          const res = await axios.post('/api/ai/chat', {
            messages: [...messages.map(m => ({ role: m.role, content: m.content })),
                       { role: 'user', content: text.trim() }],
            model
          }, { withCredentials: true })

          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, content: res.data.content || 'Sin respuesta' }
              : m
          ))
        } catch {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, content: '⚠️ No se pudo conectar con el asistente. Verifica que las API Keys estén configuradas en Configuración → Integraciones.' }
              : m
          ))
        }
      }
    } finally {
      setIsLoading(false)
    }
  }, [messages, model, isLoading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    console.log('Key pressed:', e.key, 'Input:', input, 'isLoading:', isLoading)
    if (e.key === 'Enter' && !e.shiftKey) {
      console.log('Enviando mensaje:', input)
      e.preventDefault()
      sendMessage(input)
    }
  }

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const stopStreaming = () => {
    abortRef.current?.abort()
  }

  const clearChat = () => {
    setMessages([])
    setShowQuickActions(true)
  }

  const modelInfo = MODEL_LABELS[model]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: '16px',
        pointerEvents: 'auto'
      }}
    >
      {/* Backdrop semitransparente */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'all'
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          height: '620px',
          maxHeight: 'calc(100vh - 32px)',
          background: '#0F172A',
          border: '1px solid #1E293B',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.2)',
          pointerEvents: 'all',
          animation: 'slideUp 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'linear-gradient(135deg, #0F172A 0%, #1a1040 100%)'
        }}>
          {/* Avatar IA */}
          <div style={{
            width: 40, height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(139,92,246,0.5)',
            flexShrink: 0
          }}>
            <Sparkles size={18} color="white" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.95em' }}>SKIA AI</span>
              <span style={{
                background: '#8B5CF6', color: 'white',
                fontSize: '0.65em', fontWeight: 700,
                padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.05em'
              }}>BETA</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              <span style={{ color: '#64748B', fontSize: '0.75em' }}>En línea · listo para ayudarte</span>
            </div>
          </div>

          {/* Selector de modelo */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: '#1E293B', border: '1px solid #334155',
                borderRadius: '8px', padding: '4px 8px',
                color: modelInfo.color, fontSize: '0.7em', fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Bot size={12} />
              {modelInfo.label}
              <ChevronDown size={10} />
            </button>

            {showModelMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                background: '#1E293B', border: '1px solid #334155',
                borderRadius: '10px', overflow: 'hidden', zIndex: 10,
                minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}>
                {(Object.entries(MODEL_LABELS) as [ModelOption, typeof MODEL_LABELS[ModelOption]][]).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => { setModel(key); setShowModelMenu(false) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 14px', background: model === key ? '#0F172A' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: '#F1F5F9', fontSize: '0.8em', fontWeight: 600 }}>{info.label}</div>
                      <div style={{ color: '#64748B', fontSize: '0.7em' }}>{info.badge}</div>
                    </div>
                    {model === key && <Check size={12} color={info.color} style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <button
            onClick={clearChat}
            title="Nuevo chat"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748B', padding: '4px', borderRadius: '6px',
              display: 'flex', alignItems: 'center'
            }}
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748B', padding: '4px', borderRadius: '6px',
              display: 'flex', alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Área de mensajes */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          {/* Estado inicial con acciones rápidas */}
          {showQuickActions && messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
                boxShadow: '0 0 20px rgba(139,92,246,0.4)'
              }}>
                <Sparkles size={24} color="white" />
              </div>
              <p style={{ color: '#94A3B8', fontSize: '0.85em', marginBottom: '4px' }}>
                Hola, <strong style={{ color: '#F1F5F9' }}>{userName}</strong>
              </p>
              <p style={{ color: '#F1F5F9', fontSize: '1.1em', fontWeight: 700, marginBottom: '4px' }}>
                ¿En qué te ayudo?
              </p>
              <p style={{ color: '#64748B', fontSize: '0.75em', marginBottom: '16px' }}>
                Pregúntame por infraestructura, tickets, normativa o recomendaciones
              </p>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '8px', textAlign: 'left'
              }}>
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(action.prompt)}
                    style={{
                      background: '#1E293B', border: '1px solid #334155',
                      borderRadius: '10px', padding: '10px 12px',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s ease',
                      display: 'flex', alignItems: 'flex-start', gap: '8px'
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = '#263348'
                      ;(e.currentTarget as HTMLElement).style.borderColor = '#8B5CF6'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = '#1E293B'
                      ;(e.currentTarget as HTMLElement).style.borderColor = '#334155'
                    }}
                  >
                    <span style={{ color: '#8B5CF6', marginTop: '1px', flexShrink: 0 }}>{action.icon}</span>
                    <div>
                      <div style={{ color: '#F1F5F9', fontSize: '0.78em', fontWeight: 600 }}>{action.label}</div>
                      <div style={{ color: '#64748B', fontSize: '0.7em' }}>{action.sublabel}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mensajes */}
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: '8px',
                alignItems: 'flex-start'
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #3B82F6, #1D4ED8)'
                  : 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {msg.role === 'user'
                  ? <User size={14} color="white" />
                  : <Sparkles size={14} color="white" />
                }
              </div>

              {/* Burbuja */}
              <div style={{ maxWidth: '80%' }}>
                <div style={{
                  background: msg.role === 'user' ? '#3B82F6' : '#1E293B',
                  borderRadius: msg.role === 'user'
                    ? '16px 4px 16px 16px'
                    : '4px 16px 16px 16px',
                  padding: '10px 14px',
                  color: '#F1F5F9',
                  fontSize: '0.82em',
                  lineHeight: '1.55',
                  border: msg.role === 'assistant' ? '1px solid #334155' : 'none'
                }}>
                  {msg.role === 'assistant' ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    msg.content
                  )}
                  {msg.isStreaming && (
                    <span style={{
                      display: 'inline-block', width: '2px', height: '14px',
                      background: '#8B5CF6', marginLeft: '2px',
                      animation: 'blink 0.8s infinite'
                    }} />
                  )}
                </div>

                {/* Footer del mensaje */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginTop: '4px', padding: '0 4px',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}>
                  <span style={{ color: '#475569', fontSize: '0.65em' }}>
                    {formatTime(msg.timestamp)}
                  </span>
                  {msg.role === 'assistant' && msg.model && (
                    <span style={{
                      color: MODEL_LABELS[msg.model as ModelOption]?.color || '#64748B',
                      fontSize: '0.65em', fontWeight: 600
                    }}>
                      {MODEL_LABELS[msg.model as ModelOption]?.label || msg.model}
                    </span>
                  )}
                  {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                    <button
                      onClick={() => copyMessage(msg.id, msg.content)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: copiedId === msg.id ? '#10B981' : '#475569',
                        padding: '0', display: 'flex', alignItems: 'center'
                      }}
                    >
                      {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #1E293B',
          background: '#0F172A'
        }}>
          {/* Botón de parar streaming */}
          {isLoading && (
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <button
                onClick={stopStreaming}
                style={{
                  background: '#1E293B', border: '1px solid #EF4444',
                  borderRadius: '8px', padding: '4px 12px',
                  color: '#EF4444', fontSize: '0.72em', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '4px'
                }}
              >
                <span style={{ width: 8, height: 8, background: '#EF4444', borderRadius: '2px', display: 'inline-block' }} />
                Detener respuesta
              </button>
            </div>
          )}

          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-end',
            background: '#1E293B', borderRadius: '14px',
            border: '1px solid #334155', padding: '8px 12px'
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              rows={1}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#F1F5F9', fontSize: '0.85em', resize: 'none',
                fontFamily: 'inherit', lineHeight: '1.5',
                maxHeight: '100px', overflowY: 'auto'
              }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 100) + 'px'
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              style={{
                width: 34, height: 34, borderRadius: '10px', flexShrink: 0,
                background: input.trim() && !isLoading
                  ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)'
                  : '#334155',
                border: 'none', cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
            >
              {isLoading
                ? <Loader2 size={16} color="white" style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={15} color="white" />
              }
            </button>
          </div>

          <p style={{ color: '#334155', fontSize: '0.65em', textAlign: 'center', marginTop: '6px' }}>
            Enter para enviar · Shift+Enter para nueva línea · Powered by AI · puede equivocarse
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
