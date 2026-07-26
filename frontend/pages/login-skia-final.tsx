import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import axios from 'axios';
import {
  Eye, EyeOff, Lock, Mail, Building2, User, Phone,
  ArrowRight, ChevronLeft, Shield, CheckCircle, AlertCircle,
  Activity, Package, Bell, BarChart3, TrendingUp, TrendingDown,
  Zap, Search, MapPin, FileText, DollarSign, Cpu, Grid3x3,
  CheckSquare, Users, Gauge, ArrowUpRight,
} from 'lucide-react';

type View = 'login' | 'register' | 'forgot';

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('login');

  // Login
  const [email, setEmail] = useState('admin@acme.com');
  const [password, setPassword] = useState('demo123456');
  const [showPwd, setShowPwd] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Register
  const [reg, setReg] = useState({ org_name: '', name: '', email: '', password: '', phone: '' });
  const [regShowPwd, setRegShowPwd] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Slide animation
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % 4), 5000);
    return () => clearInterval(t);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { email, password });
      if (res.data?.tenants) localStorage.setItem('tenants', JSON.stringify(res.data.tenants));
      router.push('/dashboard');
    } catch (err: any) {
      setLoginError(err?.response?.status === 401
        ? 'Correo o contraseña incorrectos.'
        : 'Error al iniciar sesión. Intenta de nuevo.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(''); setRegSuccess('');
    if (!reg.org_name || !reg.name || !reg.email || !reg.password) {
      setRegError('Todos los campos marcados con * son obligatorios.'); return;
    }
    if (reg.password.length < 6) { setRegError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setRegLoading(true);
    try {
      await axios.post('/api/auth/register', reg);
      setRegSuccess('¡Organización creada! Ya puedes iniciar sesión.');
      setTimeout(() => { setView('login'); setEmail(reg.email); }, 2500);
    } catch (err: any) {
      const d = err?.response?.data;
      setRegError(err?.response?.status === 409
        ? 'Este correo ya está registrado.'
        : (typeof d === 'string' ? d : (d?.error ?? 'Error al registrar.')));
    } finally { setRegLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(''); setForgotSuccess('');
    if (!forgotEmail) { setForgotError('Ingresa tu correo electrónico.'); return; }
    setForgotLoading(true);
    try {
      await axios.post('/api/auth/forgot-password', { email: forgotEmail });
      setForgotSuccess('Si el correo está registrado, recibirás las instrucciones en breve.');
    } catch { setForgotError('Error al procesar la solicitud.'); }
    finally { setForgotLoading(false); }
  };

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#F0F4FF',
    }}>
      {/* ══════════════════════════════════════════════════════════════
          LEFT PANEL — Formulario centrado
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

          {/* ── LOGO REAL SKIA ─────────────────────────────────────── */}
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

          {/* ── VIEW: LOGIN ──────────────────────────────────────────── */}
          {view === 'login' && (
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', marginBottom: 4, letterSpacing: '-0.4px' }}>
                  Bienvenido de vuelta
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
                  Ingresa tus credenciales para acceder al sistema
                </p>
              </div>

              {loginError && <AlertBanner msg={loginError} />}

              <FL label="Correo electrónico" required />
              <IW icon={<Mail size={15} color="#94A3B8" />}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@acme.com" required autoComplete="email" style={IS} />
              </IW>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <FL label="Contraseña" required noMargin />
                <button type="button" onClick={() => { setView('forgot'); setForgotEmail(email); }}
                  style={{ fontSize: '0.75rem', color: '#1D4ED8', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <IW icon={<Lock size={15} color="#94A3B8" />} suffix={
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', padding: 0 }}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }>
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••" required autoComplete="current-password" style={IS} />
              </IW>

              <PBtn loading={loginLoading} label="Acceder al sistema" loadingLabel="Verificando..." />

              <Divider />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                <SBtn icon={<GoogleIcon />} label="Google" />
                <SBtn icon={<AppleIcon />} label="Apple" />
              </div>

              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
                ¿Sin cuenta?{' '}
                <button type="button" onClick={() => setView('register')}
                  style={{ color: '#1D4ED8', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.82rem' }}>
                  Registrar nueva organización
                </button>
              </p>

              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
                <p style={{ fontSize: '0.72rem', color: '#94A3B8', marginBottom: 3 }}>
                  <span style={{ fontWeight: 700 }}>Demo:</span> admin@acme.com / demo123456
                </p>
                <p style={{ fontSize: '0.68rem', color: '#CBD5E1' }}>
                  Al iniciar sesión aceptas nuestros Términos de Servicio y Política de Privacidad.
                </p>
              </div>
            </form>
          )}

          {/* ── VIEW: REGISTER ───────────────────────────────────────── */}
          {view === 'register' && (
            <form onSubmit={handleRegister}>
              <BackBtn onClick={() => setView('login')} />
              <div style={{ marginBottom: 20, textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: 4, letterSpacing: '-0.4px' }}>
                  Crear nueva organización
                </h1>
                <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Configura tu cuenta SKIA DCIM en minutos</p>
              </div>

              {regError && <AlertBanner msg={regError} />}
              {regSuccess && <SuccessBanner msg={regSuccess} />}

              <FL label="Nombre de la organización" required />
              <IW icon={<Building2 size={15} color="#94A3B8" />}>
                <input type="text" value={reg.org_name} onChange={e => setReg(r => ({ ...r, org_name: e.target.value }))}
                  placeholder="Ej. ACME Corp" required style={IS} />
              </IW>

              <FL label="Tu nombre completo" required />
              <IW icon={<User size={15} color="#94A3B8" />}>
                <input type="text" value={reg.name} onChange={e => setReg(r => ({ ...r, name: e.target.value }))}
                  placeholder="Ing. Carlos Méndez" required style={IS} />
              </IW>

              <FL label="Correo electrónico" required />
              <IW icon={<Mail size={15} color="#94A3B8" />}>
                <input type="email" value={reg.email} onChange={e => setReg(r => ({ ...r, email: e.target.value }))}
                  placeholder="carlos@empresa.com" required style={IS} />
              </IW>

              <FL label="Contraseña" required />
              <IW icon={<Lock size={15} color="#94A3B8" />} suffix={
                <button type="button" onClick={() => setRegShowPwd(!regShowPwd)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', padding: 0 }}>
                  {regShowPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }>
                <input type={regShowPwd ? 'text' : 'password'} value={reg.password} onChange={e => setReg(r => ({ ...r, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres" required style={IS} />
              </IW>

              <FL label="Teléfono (opcional)" />
              <IW icon={<Phone size={15} color="#94A3B8" />}>
                <input type="tel" value={reg.phone} onChange={e => setReg(r => ({ ...r, phone: e.target.value }))}
                  placeholder="+52 664 000 0000" style={IS} />
              </IW>

              <PBtn loading={regLoading} label="Crear organización" loadingLabel="Creando organización..." />
              <p style={{ textAlign: 'center', fontSize: '0.7rem', color: '#94A3B8', marginTop: 12 }}>
                Al registrarte aceptas nuestros Términos de Servicio y Política de Privacidad.
              </p>
            </form>
          )}

          {/* ── VIEW: FORGOT ─────────────────────────────────────────── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgot}>
              <BackBtn onClick={() => setView('login')} />
              <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, background: '#EFF6FF', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Shield size={26} color="#1D4ED8" />
                </div>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: 6, letterSpacing: '-0.4px' }}>
                  Recuperar contraseña
                </h1>
                <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.6 }}>
                  Ingresa el correo de tu cuenta y te enviaremos las instrucciones para restablecer tu contraseña.
                </p>
              </div>

              {forgotError && <AlertBanner msg={forgotError} />}
              {forgotSuccess && <SuccessBanner msg={forgotSuccess} />}

              {!forgotSuccess && (
                <>
                  <FL label="Correo electrónico" required />
                  <IW icon={<Mail size={15} color="#94A3B8" />}>
                    <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      placeholder="tu@empresa.com" required style={IS} />
                  </IW>
                  <PBtn loading={forgotLoading} label="Enviar instrucciones" loadingLabel="Enviando..." />
                </>
              )}
              {forgotSuccess && (
                <button type="button" onClick={() => setView('login')} style={PS(false)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    Volver al inicio de sesión <ArrowRight size={17} />
                  </span>
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          RIGHT PANEL — Dashboard impactante
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(145deg, #0A1628 0%, #0F2347 30%, #0E3A6E 65%, #0B4D9E 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative elements */}
        <div style={{ position: 'absolute', top: -120, right: -120, width: 500, height: 500, background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -100, width: 420, height: 420, background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '40%', right: '5%', width: 250, height: 250, background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', borderRadius: '50%' }} />
        {/* Grid pattern overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 620 }}>

          {/* Header badge */}
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

          {/* Module pills */}
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

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
            <KPI label="Activos" value="1,234" icon={<Package size={14} />} color="#3B82F6" sub="+12 este mes" up />
            <KPI label="Tickets" value="42" icon={<Bell size={14} />} color="#F59E0B" sub="8 críticos" />
            <KPI label="SLA" value="94%" icon={<Gauge size={14} />} color="#10B981" sub="+2% vs mes" up highlight />
            <KPI label="Usuarios" value="8" icon={<Users size={14} />} color="#8B5CF6" sub="2 en línea" />
          </div>

          {/* Animated dashboard slides */}
          <div style={{ position: 'relative', height: 248, marginBottom: 14 }}>
            {[
              <SlideInventario key={0} />,
              <SlideTickets key={1} />,
              <SlideSLA key={2} />,
              <SlideModulos key={3} />,
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

          {/* Dots */}
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

function FL({ label, required = false, noMargin = false }: { label: string; required?: boolean; noMargin?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#374151', marginBottom: 5, marginTop: noMargin ? 0 : 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
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

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginBottom: 20, padding: 0 }}>
      <ChevronLeft size={15} /> Volver al inicio de sesión
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>O continúa con</span>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
    </div>
  );
}

function SBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 11, background: h ? '#F8FAFF' : '#fff', fontSize: '0.83rem', fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 150ms' }}>
      {icon}{label}
    </button>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, icon, color, sub, up, highlight }: { label: string; value: string; icon: React.ReactNode; color: string; sub: string; up?: boolean; highlight?: boolean }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderRadius: 12, padding: '11px 13px', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ color, opacity: 0.9 }}>{icon}</div>
        {up !== undefined && (
          up ? <TrendingUp size={10} color="#10B981" /> : <TrendingDown size={10} color="#EF4444" />
        )}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: highlight ? '#34D399' : '#fff', lineHeight: 1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ─── Slide 1: Inventario de Activos ──────────────────────────────────────────
function SlideInventario() {
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<Package size={13} color="#3B82F6" />} title="Inventario de Activos" badge="1,234 activos" badgeColor="#3B82F6" />
      <div style={{ padding: '10px 14px' }}>
        <SearchBar placeholder="Buscar activo, rack, switch, UPS..." />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
          {[
            { code: 'UPS-MDF-001', name: 'UPS Sala NOC', type: 'UPS · Sótano 1', status: 'Activo', sc: '#10B981' },
            { code: 'SW-CORE-A001', name: 'Switch Core Cisco 9300', type: 'Switch · Torre A', status: 'Activo', sc: '#10B981' },
            { code: 'RACK-MDF-003', name: 'Rack Principal Torre A', type: 'Rack · MDF', status: 'Activo', sc: '#10B981' },
            { code: 'PP-IDF2-012', name: 'Patch Panel Cat6A 48p', type: 'Patch Panel · IDF2', status: 'Mant.', sc: '#F59E0B' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: 26, height: 26, background: 'rgba(59,130,246,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Package size={11} color="#3B82F6" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.85)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)' }}>{item.type}</div>
              </div>
              <span style={{ padding: '2px 6px', background: `${item.sc}18`, borderRadius: 4, fontSize: '0.58rem', color: item.sc, fontWeight: 700, flexShrink: 0 }}>{item.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: Tickets de Incidencias ─────────────────────────────────────────
function SlideTickets() {
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<Zap size={13} color="#F59E0B" />} title="Tickets de Incidencias" badge="42 abiertos" badgeColor="#EF4444" />
      <div style={{ padding: '10px 14px' }}>
        {[
          { id: 'TK-0042', title: 'Falla de energía en UPS — Sala NOC', priority: 'Crítica', time: 'hace 2h', pc: '#EF4444', status: 'Abierto' },
          { id: 'TK-0041', title: 'Switch Core sin respuesta ping', priority: 'Crítica', time: 'hace 4h', pc: '#EF4444', status: 'En proceso' },
          { id: 'TK-0040', title: 'Temperatura elevada IDF Piso 7', priority: 'Media', time: 'hace 6h', pc: '#F59E0B', status: 'Abierto' },
          { id: 'TK-0039', title: 'Revisión anual UPS Torre B', priority: 'Baja', time: 'hace 1d', pc: '#3B82F6', status: 'Programado' },
        ].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div style={{ width: 7, height: 7, background: t.pc, borderRadius: '50%', marginTop: 4, flexShrink: 0, boxShadow: `0 0 5px ${t.pc}60` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>{t.id}</span>
                <span style={{ fontSize: '0.6rem', color: t.pc, fontWeight: 700 }}>{t.priority}</span>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>{t.time}</span>
              </div>
            </div>
            <span style={{ padding: '2px 7px', background: 'rgba(255,255,255,0.06)', borderRadius: 5, fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, flexShrink: 0 }}>{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Slide 3: Cumplimiento SLA ────────────────────────────────────────────────
function SlideSLA() {
  const bars = [72, 85, 61, 94, 78, 90, 94];
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<BarChart3 size={13} color="#10B981" />} title="Cumplimiento SLA — Esta semana" badge="+2.4%" badgeColor="#10B981" />
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 80, marginBottom: 8 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: `${h}%`, background: i === 6 ? 'linear-gradient(180deg, #34D399, #059669)' : i === 2 ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.35)', borderRadius: '4px 4px 0 0', position: 'relative' }}>
                {i === 6 && <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: '0.55rem', color: '#34D399', fontWeight: 800, whiteSpace: 'nowrap' }}>94%</div>}
              </div>
              <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{labels[i]}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 10 }}>
          {[
            { label: 'Promedio', value: '82%', color: '#3B82F6' },
            { label: 'Mejor día', value: '94%', color: '#10B981' },
            { label: 'Incumplidos', value: '3', color: '#EF4444' },
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

// ─── Slide 4: Módulos del sistema ─────────────────────────────────────────────
function SlideModulos() {
  const mods = [
    { icon: <Package size={16} />, label: 'Activos', desc: '1,234 registrados', color: '#3B82F6', up: true },
    { icon: <Grid3x3 size={16} />, label: 'Racks', desc: '48 racks activos', color: '#8B5CF6', up: true },
    { icon: <Cpu size={16} />, label: 'Switches', desc: '127 dispositivos', color: '#06B6D4', up: false },
    { icon: <Zap size={16} />, label: 'UPS / PDU', desc: '34 monitoreados', color: '#F59E0B', up: true },
    { icon: <FileText size={16} />, label: 'Planos', desc: '12 planos activos', color: '#10B981', up: false },
    { icon: <DollarSign size={16} />, label: 'CAPEX', desc: '$2.4M presupuesto', color: '#EF4444', up: true },
  ];
  return (
    <div style={slideWrap}>
      <SlideHeader icon={<Activity size={13} color="#8B5CF6" />} title="Módulos del Sistema" badge="Todo operativo" badgeColor="#10B981" />
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
          {mods.map((m, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 9, padding: '10px 10px', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ color: m.color }}>{m.icon}</div>
                {m.up ? <ArrowUpRight size={10} color="#10B981" /> : <ArrowUpRight size={10} color="#EF4444" style={{ transform: 'rotate(90deg)' }} />}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Slide helpers ────────────────────────────────────────────────────────────
const slideWrap: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(16px)',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.1)',
  overflow: 'hidden',
  height: '100%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};

function SlideHeader({ icon, title, badge, badgeColor }: { icon: React.ReactNode; title: string; badge: string; badgeColor: string }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon}
        <span style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{title}</span>
      </div>
      <span style={{ padding: '2px 9px', background: `${badgeColor}20`, borderRadius: 6, fontSize: '0.63rem', color: badgeColor, fontWeight: 700 }}>{badge}</span>
    </div>
  );
}

function SearchBar({ placeholder }: { placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 11px', border: '1px solid rgba(255,255,255,0.07)' }}>
      <Search size={12} color="rgba(255,255,255,0.3)" />
      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.28)' }}>{placeholder}</span>
    </div>
  );
}

// ─── Social Icons ─────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}
