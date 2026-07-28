import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import axios from 'axios';
import {
  Lock, Eye, EyeOff, ArrowRight, CheckCircle, AlertCircle,
  Shield, KeyRound, Package, Grid3x3, Cpu, MapPin, FileText,
  DollarSign, CheckSquare, Zap, Bell, Gauge, Users, BarChart3,
  Activity,
} from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { token } = router.query;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tokenMissing, setTokenMissing] = useState(false);

  // Slide animation (igual que login)
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % 4), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (router.isReady && !token) {
      setTokenMissing(true);
    }
  }, [router.isReady, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await axios.post('/api/auth/reset-password', { token, password });
      setSuccess('¡Contraseña actualizada correctamente! Redirigiendo al inicio de sesión...');
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      const d = err?.response?.data;
      setError(typeof d === 'string' ? d : (d?.error ?? 'Error al restablecer la contraseña. El enlace puede haber expirado.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#F0F4FF',
    }}>
      {/* ══════════════════════════════════════════════════════════════
          LEFT PANEL — Formulario
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        width: '100%', maxWidth: 500, minHeight: '100vh',
        background: '#fff', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px',
        boxShadow: '6px 0 48px rgba(15,23,42,0.08)',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Logo */}
          <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
            <Image
              src="/logo-skia.png"
              alt="SKIA Sistema DCIM"
              width={200}
              height={49}
              priority
              style={{ objectFit: 'contain' }}
            />
          </div>

          {/* Token inválido */}
          {tokenMissing ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, background: '#FEF2F2', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <AlertCircle size={28} color="#DC2626" />
              </div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
                Enlace inválido
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: 1.6, marginBottom: 24 }}>
                Este enlace de recuperación no es válido o ha expirado. Solicita uno nuevo desde la pantalla de inicio de sesión.
              </p>
              <button
                type="button"
                onClick={() => router.push('/login')}
                style={PS(false)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  Ir al inicio de sesión <ArrowRight size={17} />
                </span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, background: '#EFF6FF', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <KeyRound size={26} color="#1D4ED8" />
                </div>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: 6, letterSpacing: '-0.4px' }}>
                  Nueva contraseña
                </h1>
                <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.6 }}>
                  Elige una contraseña segura para tu cuenta SKIA DCIM.
                </p>
              </div>

              {error && <AlertBanner msg={error} />}
              {success && <SuccessBanner msg={success} />}

              {!success && (
                <>
                  <FL label="Nueva contraseña" required />
                  <IW icon={<Lock size={15} color="#94A3B8" />} suffix={
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', padding: 0 }}>
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      autoComplete="new-password"
                      style={IS}
                    />
                  </IW>

                  <FL label="Confirmar contraseña" required />
                  <IW icon={<Shield size={15} color="#94A3B8" />} suffix={
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', padding: 0 }}>
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }>
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repite tu nueva contraseña"
                      required
                      autoComplete="new-password"
                      style={IS}
                    />
                  </IW>

                  {/* Indicador de fortaleza */}
                  {password.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        {[1, 2, 3, 4].map(i => {
                          const strength = password.length >= 12 ? 4 : password.length >= 8 ? 3 : password.length >= 6 ? 2 : 1;
                          const colors = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'];
                          return (
                            <div key={i} style={{
                              flex: 1, height: 3, borderRadius: 2,
                              background: i <= strength ? colors[strength - 1] : '#E2E8F0',
                              transition: 'background 200ms',
                            }} />
                          );
                        })}
                      </div>
                      <p style={{ fontSize: '0.68rem', color: '#94A3B8', margin: 0 }}>
                        {password.length < 6 ? 'Muy corta' : password.length < 8 ? 'Aceptable' : password.length < 12 ? 'Buena' : 'Excelente'}
                      </p>
                    </div>
                  )}

                  <PBtn loading={loading} label="Restablecer contraseña" loadingLabel="Actualizando..." />

                  <p style={{ textAlign: 'center', marginTop: 18 }}>
                    <button type="button" onClick={() => router.push('/login')}
                      style={{ fontSize: '0.8rem', color: '#1D4ED8', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      ← Volver al inicio de sesión
                    </button>
                  </p>
                </>
              )}
            </form>
          )}

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
            <p style={{ fontSize: '0.68rem', color: '#CBD5E1', margin: 0 }}>
              Al continuar aceptas nuestros Términos de Servicio y Política de Privacidad.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          RIGHT PANEL — Dashboard impactante (igual que login)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(145deg, #0A1628 0%, #0F2347 30%, #0E3A6E 65%, #0B4D9E 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -120, right: -120, width: 500, height: 500, background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -100, width: 420, height: 420, background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 620 }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 24, padding: '6px 16px', marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, background: '#10B981', borderRadius: '50%', boxShadow: '0 0 8px #10B981' }} />
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.85)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Plataforma DCIM · En vivo</span>
            </div>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.8px', marginBottom: 14 }}>
              Administra tu<br />
              <span style={{ background: 'linear-gradient(90deg, #60A5FA, #34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Infraestructura de Red
              </span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 480 }}>
              Memoria Técnica · Planos · Evaluación de Normativa · CAPEX · Proyectos · Requisiciones
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
            {[
              { icon: <Package size={11} />, label: 'Activos' },
              { icon: <Grid3x3 size={11} />, label: 'Racks' },
              { icon: <Cpu size={11} />, label: 'Switches' },
              { icon: <MapPin size={11} />, label: 'MDF / IDF' },
              { icon: <FileText size={11} />, label: 'Planos' },
              { icon: <DollarSign size={11} />, label: 'CAPEX' },
              { icon: <CheckSquare size={11} />, label: 'Tickets' },
              { icon: <Zap size={11} />, label: 'UPS / PDU' },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                <span style={{ color: '#60A5FA' }}>{m.icon}</span>{m.label}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
            {[
              { label: 'Activos', value: '1,234', color: '#3B82F6', sub: '+12 este mes' },
              { label: 'Tickets', value: '42', color: '#F59E0B', sub: '8 críticos' },
              { label: 'SLA', value: '94%', color: '#10B981', sub: '+2% vs mes' },
              { label: 'Usuarios', value: '8', color: '#8B5CF6', sub: '2 en línea' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 10px' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: 4 }}>{k.label}</div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Slide animado */}
          <div style={{ position: 'relative', height: 200, marginBottom: 14 }}>
            {[
              <SlideSeguridad key={0} />,
              <SlideModulos key={1} />,
              <SlideSLA key={2} />,
              <SlideInfo key={3} />,
            ].map((s, i) => (
              <div key={i} style={{
                position: 'absolute', inset: 0,
                opacity: slide === i ? 1 : 0,
                transform: slide === i ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.985)',
                transition: 'all 0.7s cubic-bezier(0.4,0,0.2,1)',
                pointerEvents: slide === i ? 'auto' : 'none',
              }}>{s}</div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            {[0, 1, 2, 3].map(i => (
              <button key={i} onClick={() => setSlide(i)} style={{
                width: slide === i ? 20 : 6, height: 6, borderRadius: 3,
                background: slide === i ? '#3B82F6' : 'rgba(255,255,255,0.2)',
                border: 'none', cursor: 'pointer', transition: 'all 0.3s', padding: 0,
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

const IS: React.CSSProperties = {
  width: '100%', padding: '12px 8px', background: 'transparent',
  border: 'none', fontSize: '0.875rem', color: '#1E293B', outline: 'none',
};

function FL({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#374151', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {label}{required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
    </label>
  );
}

function IW({ icon, suffix, children }: { icon: React.ReactNode; suffix?: React.ReactNode; children: React.ReactNode }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: '#F8FAFF', border: `1.5px solid ${f ? '#1D4ED8' : '#E2E8F0'}`, borderRadius: 11, marginBottom: 13, transition: 'border-color 150ms' }}
      onFocusCapture={() => setF(true)} onBlurCapture={() => setF(false)}>
      <div style={{ paddingLeft: 13, paddingRight: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>{children}</div>
      {suffix && <div style={{ paddingRight: 13, paddingLeft: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{suffix}</div>}
    </div>
  );
}

const PS = (loading: boolean): React.CSSProperties => ({
  width: '100%', padding: '13px 20px', marginTop: 16,
  background: loading ? '#93C5FD' : 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)',
  color: '#fff', border: 'none', borderRadius: 11, fontSize: '0.875rem', fontWeight: 700,
  cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 200ms', display: 'block',
  boxShadow: loading ? 'none' : '0 4px 18px rgba(29,78,216,0.4)',
});

function PBtn({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button type="submit" disabled={loading} style={PS(loading)}>
      {loading
        ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><Spin />{loadingLabel}</span>
        : <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>{label}<ArrowRight size={17} /></span>
      }
    </button>
  );
}

function Spin() {
  return (
    <>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: '_spin 0.7s linear infinite' }} />
    </>
  );
}

function AlertBanner({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 13px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, marginBottom: 14, fontSize: '0.8rem', color: '#DC2626', lineHeight: 1.5 }}>
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
    </div>
  );
}

function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 13px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 9, marginBottom: 14, fontSize: '0.8rem', color: '#16A34A', lineHeight: 1.5 }}>
      <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
    </div>
  );
}

// ─── Slides del panel derecho ─────────────────────────────────────────────────

const slideWrap: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14, overflow: 'hidden', height: '100%',
};

function SlideHeader({ icon, title, badge, badgeColor }: { icon: React.ReactNode; title: string; badge: string; badgeColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{title}</span>
      </div>
      <span style={{ fontSize: '0.62rem', color: badgeColor, fontWeight: 700, background: `${badgeColor}20`, padding: '2px 8px', borderRadius: 10 }}>{badge}</span>
    </div>
  );
}

function SlideSeguridad() {
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<Shield size={13} color="#10B981" />} title="Seguridad de cuenta" badge="Activa" badgeColor="#10B981" />
      <div style={{ padding: '14px' }}>
        {[
          { label: 'Autenticación 2FA', status: 'Habilitada', color: '#10B981' },
          { label: 'Sesiones activas', status: '1 dispositivo', color: '#3B82F6' },
          { label: 'Último acceso', status: 'Hoy', color: '#F59E0B' },
          { label: 'Contraseña', status: 'Actualizando...', color: '#8B5CF6' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{item.label}</span>
            <span style={{ fontSize: '0.68rem', color: item.color, fontWeight: 700, background: `${item.color}15`, padding: '2px 8px', borderRadius: 6 }}>{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideModulos() {
  const mods = [
    { icon: <Package size={14} />, label: 'Activos', desc: '1,234 registrados', color: '#3B82F6' },
    { icon: <Grid3x3 size={14} />, label: 'Racks', desc: '48 activos', color: '#8B5CF6' },
    { icon: <Cpu size={14} />, label: 'Switches', desc: '127 dispositivos', color: '#06B6D4' },
    { icon: <Zap size={14} />, label: 'UPS / PDU', desc: '34 monitoreados', color: '#F59E0B' },
    { icon: <FileText size={14} />, label: 'Planos', desc: '12 activos', color: '#10B981' },
    { icon: <Bell size={14} />, label: 'Tickets', desc: '42 abiertos', color: '#EF4444' },
  ];
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<Activity size={13} color="#8B5CF6" />} title="Módulos del Sistema" badge="Todo operativo" badgeColor="#10B981" />
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          {mods.map((m, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ color: m.color, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)' }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideSLA() {
  const bars = [72, 85, 61, 94, 78, 90, 94];
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<BarChart3 size={13} color="#10B981" />} title="Cumplimiento SLA" badge="+2.4%" badgeColor="#10B981" />
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 70, marginBottom: 8 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: `${h}%`, background: i === 6 ? 'linear-gradient(180deg, #34D399, #059669)' : 'rgba(59,130,246,0.35)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{labels[i]}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 8 }}>
          {[
            { label: 'Promedio', value: '82%', color: '#3B82F6' },
            { label: 'Mejor día', value: '94%', color: '#10B981' },
            { label: 'Tickets SLA', value: '17', color: '#F59E0B' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '7px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideInfo() {
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<Gauge size={13} color="#3B82F6" />} title="Estado del sistema" badge="Operativo" badgeColor="#10B981" />
      <div style={{ padding: '14px' }}>
        {[
          { label: 'API Backend', value: '99.9% uptime', color: '#10B981' },
          { label: 'Base de datos', value: 'PostgreSQL · OK', color: '#3B82F6' },
          { label: 'Almacenamiento', value: '2.4 TB disponible', color: '#8B5CF6' },
          { label: 'Usuarios activos', value: '8 en línea', color: '#F59E0B' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{item.label}</span>
            <span style={{ fontSize: '0.68rem', color: item.color, fontWeight: 700 }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
