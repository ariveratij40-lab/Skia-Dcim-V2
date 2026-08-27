import { useState, useEffect, ReactNode } from 'react';
import GlobalSearch from './GlobalSearch';
import AsistenteIA from './AsistenteIA';
import InfrastructureReadinessWizard from './InfrastructureReadinessWizard';
import useInfrastructureReadiness, { ReadinessActionTarget } from '../hooks/useInfrastructureReadiness';
import { useRouter } from 'next/router';
import axios from 'axios';
import {
  Menu, X, LogOut, LayoutDashboard, Building2, Settings, Package,
  Grid3x3, ChevronDown, Zap, Network, Layers, Database, Radio, Map, FileText,
  DollarSign, Cpu, Users, Wrench, Tag, Bell, Moon, Sun, Search,
  HelpCircle, Plus, BookOpen, Upload, Puzzle, Sparkles
} from 'lucide-react';

interface SubItem { id: string; label: string; icon: any; path: string; }
interface NavItem  { id: string; label: string; icon: any; path?: string; children?: SubItem[]; reserved?: boolean; }
interface AppLayoutProps { children: ReactNode; title?: string; breadcrumb?: { label: string; path?: string }[]; }

// Only routes backed by real Next.js pages are clickable. Domains without an
// operational page remain visible as reserved headings instead of dead links.
const NAVIGATION: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  {
    id: 'infraestructura', label: 'Infraestructura', icon: Building2,
    children: [
      { id: 'mdf-idf', label: 'MDF / IDF', icon: Database, path: '/infraestructura/mdf-idf' },
      { id: 'racks', label: 'Racks', icon: Grid3x3, path: '/infraestructura/racks' },
      { id: 'patch-panels', label: 'Patch Panels', icon: Network, path: '/infraestructura/patch-panels' },
      { id: 'backbone', label: 'Backbone', icon: Layers, path: '/infraestructura/backbone' },
      { id: 'nodos', label: 'Nodos', icon: Radio, path: '/infraestructura/nodos' },
      { id: 'topologia', label: 'Topología', icon: Map, path: '/infraestructura/topologia' },
      { id: 'planos', label: 'Planos', icon: FileText, path: '/infraestructura/planos' },
      { id: 'ubicaciones', label: 'Ubicaciones', icon: Map, path: '/infraestructura/catalogs/ubicaciones' },
    ],
  },
  {
    id: 'equipos', label: 'Equipos', icon: Zap,
    children: [
      { id: 'switches', label: 'Switches', icon: Network, path: '/infraestructura/switches' },
      { id: 'ups-pdus', label: 'UPS / PDU', icon: Zap, path: '/infraestructura/ups-pdus' },
    ],
  },
  {
    id: 'inventario', label: 'Inventario', icon: Package,
    children: [
      { id: 'activos', label: 'Resumen de Activos', icon: Package, path: '/infraestructura/activos' },
      { id: 'import-inventory', label: 'Importar Inventario', icon: Upload, path: '/infraestructura/import-inventory' },
      { id: 'etiquetas-rfid', label: 'RFID', icon: Tag, path: '/infraestructura/etiquetas-rfid' },
    ],
  },
  { id: 'operaciones', label: 'Operaciones', icon: Wrench, reserved: true },
  { id: 'monitoreo', label: 'Monitoreo', icon: Cpu, reserved: true },
  {
    id: 'gestion', label: 'Gestión', icon: BookOpen,
    children: [
      { id: 'fabricantes', label: 'Fabricantes', icon: BookOpen, path: '/infraestructura/catalogs/fabricantes' },
      { id: 'proveedores', label: 'Proveedores', icon: Puzzle, path: '/infraestructura/catalogs/proveedores' },
      { id: 'nomenclaturas', label: 'Nomenclaturas', icon: Tag, path: '/infraestructura/catalogs/nomenclaturas' },
    ],
  },
  { id: 'documentacion', label: 'Documentación', icon: FileText, reserved: true },
  {
    id: 'capex', label: 'CAPEX', icon: DollarSign,
    children: [
      { id: 'presupuestos', label: 'Presupuestos', icon: DollarSign, path: '/capex/presupuestos' },
    ],
  },
  {
    id: 'administracion', label: 'Administración', icon: Users,
    children: [
      { id: 'admin', label: 'Administración general', icon: Users, path: '/administracion' },
      { id: 'configuracion', label: 'Configuración', icon: Settings, path: '/configuracion' },
    ],
  },
];

export default function AppLayout({ children, title, breadcrumb }: AppLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [tenantLogo, setTenantLogo] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showAI, setShowAI] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);
  const currentPath = router.pathname;
  const readiness = useInfrastructureReadiness(Boolean(user));

  useEffect(() => {
    if (!readiness.data || readiness.data.ready) return;
    const key = `skia_readiness_dismissed:${readiness.data.branch.id}`;
    if (sessionStorage.getItem(key) !== 'true') setShowReadiness(true);
  }, [readiness.data]);

  const closeReadiness = () => {
    if (readiness.data) sessionStorage.setItem(`skia_readiness_dismissed:${readiness.data.branch.id}`, 'true');
    setShowReadiness(false);
  };

  const runReadinessAction = (target: ReadinessActionTarget) => {
    setShowReadiness(false);
    if (target === 'rack_create') void router.push('/infraestructura/racks');
    // Site y Área se crean inline dentro de MdfIdfWizard: este es el
    // orquestador canónico existente, no tres formularios independientes.
    else void router.push('/infraestructura/mdf-idf?create=MDF&from=readiness');
  };

  // Verificar autenticación solo una vez al montar — no en cada cambio de ruta
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await axios.get('/api/auth/me');
        const userData = res.data.user;
        setUser(userData);
        // Si la sesión no tiene tenant_id asignado, auto-seleccionar el primer tenant disponible
        if (!userData.tenant_id) {
          try {
            const tenantsRes = await axios.get('/api/auth/tenants');
            const tenants = tenantsRes.data?.tenants || [];
            if (tenants.length > 0) {
              await axios.post('/api/auth/select-tenant', { tenantId: tenants[0].id });
              // Guardar nombre/logo del tenant en localStorage
              if (tenants[0].name) localStorage.setItem('tenant_name', tenants[0].name);
              if (tenants[0].logo) localStorage.setItem('tenant_logo', tenants[0].logo);
              setTenantName(tenants[0].name || null);
              setTenantLogo(tenants[0].logo || null);
            }
          } catch {/* ignorar errores de select-tenant */}
        }
      } catch (err: unknown) {
        // Solo redirigir al login si el servidor responde 401/403 explicitamente
        // Errores de red o timeouts NO deben desloguear al usuario
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          router.push('/login');
        }
      }
    };
    loadUser();
    try {
      const tLogo = sessionStorage.getItem('tenant_logo') || localStorage.getItem('tenant_logo');
      const tName = sessionStorage.getItem('tenant_name') || localStorage.getItem('tenant_name');
      if (tLogo) setTenantLogo(tLogo);
      if (tName) setTenantName(tName);
      const savedTheme = localStorage.getItem('skia_theme');
      if (savedTheme === 'dark') setDarkMode(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al montar — no en cada cambio de ruta

  // Expandir grupo activo del sidebar al cambiar de ruta (sin verificar auth)
  useEffect(() => {
    try {
      const activeGroup = NAVIGATION.find(n => n.children?.some(c => currentPath === c.path || currentPath.startsWith(c.path + '/')));
      if (activeGroup) {
        setExpanded(prev => {
          if (prev.has(activeGroup.id)) return prev;
          const next = new Set(prev);
          next.add(activeGroup.id);
          return next;
        });
      }
    } catch {}
  }, [currentPath]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleLogout = async () => {
    try { await axios.post('/api/auth/logout'); localStorage.clear(); router.push('/login'); } catch {}
  };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('skia_theme', next ? 'dark' : 'light');
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Mangos-inspired tokens ────────────────────────────────────────────────
  const C = darkMode ? {
    bg:            '#1A1D2E',
    sidebar:       '#212438',
    sidebarBorder: '#2D3154',
    topbar:        'rgba(33,36,56,0.96)',
    topbarBorder:  '#2D3154',
    surface:       '#252840',
    surface2:      '#2D3154',
    outline:       '#3D4270',
    outlineVar:    '#2D3154',
    primary:       '#4361EE',
    primaryHover:  '#5A75F0',
    text1:         '#E8EAF6',
    text2:         '#9EA3C8',
    text3:         '#5C6194',
    activeItem:    'rgba(67,97,238,0.18)',
    hoverItem:     'rgba(255,255,255,0.05)',
    activeText:    '#7B93F5',
    danger:        '#F05252',
    success:       '#31C48D',
    warning:       '#F6A609',
    searchBg:      '#2D3154',
    searchBorder:  '#3D4270',
    searchText:    '#E8EAF6',
    userBg:        '#2D3154',
    userBorder:    '#3D4270',
    avatarBg:      '#4361EE',
    notifDot:      '#F05252',
    ctaBg:         '#4361EE',
    ctaHover:      '#5A75F0',
  } : {
    // Mangos light: fondo azul-gris muy suave, sidebar blanco
    bg:            '#EEF0F8',
    sidebar:       '#FFFFFF',
    sidebarBorder: '#E8EBF4',
    topbar:        'rgba(255,255,255,0.96)',
    topbarBorder:  '#E8EBF4',
    surface:       '#FFFFFF',
    surface2:      '#F4F5FB',
    outline:       '#DDE0EE',
    outlineVar:    '#E8EBF4',
    primary:       '#4361EE',
    primaryHover:  '#3451D1',
    text1:         '#1A1D2E',
    text2:         '#5C6194',
    text3:         '#9EA3C8',
    activeItem:    '#EEF1FD',
    hoverItem:     '#F4F5FB',
    activeText:    '#4361EE',
    danger:        '#F05252',
    success:       '#31C48D',
    warning:       '#F6A609',
    searchBg:      '#F4F5FB',
    searchBorder:  '#DDE0EE',
    searchText:    '#1A1D2E',
    userBg:        '#F4F5FB',
    userBorder:    '#E8EBF4',
    avatarBg:      '#4361EE',
    notifDot:      '#F05252',
    ctaBg:         '#4361EE',
    ctaHover:      '#3451D1',
  };

  return (
    <>
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: C.bg,
      fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>

      {/* ══════════ SIDEBAR ══════════ */}
      <aside style={{
        width: sidebarOpen ? 220 : 56,
        minWidth: sidebarOpen ? 220 : 56,
        background: C.sidebar,
        borderRight: `1px solid ${C.sidebarBorder}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 220ms cubic-bezier(0.4,0,0.2,1), min-width 220ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        position: 'sticky',
        top: 0,
        height: '100vh',
        boxShadow: darkMode ? 'none' : '2px 0 8px rgba(67,97,238,0.06)',
      }}>

        {/* Logo */}
        <div style={{
          padding: sidebarOpen ? '18px 16px 14px' : '18px 10px 14px',
          borderBottom: `1px solid ${C.sidebarBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarOpen ? 'space-between' : 'center',
          minHeight: 68,
          flexShrink: 0,
        }}>
          {sidebarOpen ? (
            <img
              src="/logo-skia.jpg"
              alt="SKIA DCIM"
              style={{ height: 40, width: 'auto', maxWidth: 160, objectFit: 'contain' }}
            />
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              overflow: 'hidden', background: C.surface2,
              border: `1px solid ${C.sidebarBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src="/logo-skia.jpg" alt="SKIA" style={{ width: 30, height: 30, objectFit: 'contain' }} />
            </div>
          )}
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 120ms' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text2)}
              onMouseLeave={e => (e.currentTarget.style.color = C.text3)}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Tenant */}
        {sidebarOpen && (
          <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${C.sidebarBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {tenantLogo
                ? <img src={tenantLogo} alt={tenantName ?? 'Tenant'} style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'contain', border: `1px solid ${C.outline}` }} />
                : <div style={{ width: 22, height: 22, borderRadius: 5, border: `1.5px dashed ${C.outline}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={10} style={{ color: C.text3 }} />
                  </div>
              }
              <div>
                <div style={{ color: C.text1, fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{tenantName ?? 'Sin organización'}</div>
                <div style={{ color: C.text3, fontSize: '0.65rem' }}>{tenantName ? 'Organización activa' : 'Configura en Branding'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px' }}>
          {NAVIGATION.map(item => {
            const Icon = item.icon;
            const hasChildren = !!(item.children?.length);
            const isExpanded = expanded.has(item.id);
            const isActive = currentPath === item.path;
            const hasActiveChild = item.children?.some(c => currentPath === c.path || currentPath.startsWith(c.path + '/'));
            const isHighlighted = isActive || hasActiveChild;

            return (
              <div key={item.id} style={{ marginBottom: 2 }}>
                <button
                  onClick={() => hasChildren ? toggleExpand(item.id) : item.path && router.push(item.path)}
                  disabled={item.reserved}
                  title={item.reserved ? 'Dominio reservado: no hay rutas operativas disponibles' : item.label}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: sidebarOpen ? '7px 10px' : '8px',
                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                    borderRadius: 10,
                    border: 'none',
                    cursor: item.reserved ? 'default' : 'pointer',
                    transition: 'all 140ms ease',
                    background: isHighlighted ? C.activeItem : 'transparent',
                    color: item.reserved ? C.text3 : isHighlighted ? C.activeText : C.text2,
                    opacity: item.reserved ? 0.68 : 1,
                  }}
                  onMouseEnter={e => { if (!item.reserved && !isHighlighted) { (e.currentTarget as HTMLElement).style.background = C.hoverItem; (e.currentTarget as HTMLElement).style.color = C.text1; } }}
                  onMouseLeave={e => { if (!item.reserved && !isHighlighted) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.text2; } }}
                >
                  <Icon size={15} style={{ flexShrink: 0 }} />
                  {sidebarOpen && (
                    <>
                      <span style={{ flex: 1, textAlign: 'left', fontSize: '0.83rem', fontWeight: isHighlighted ? 600 : 400 }}>{item.label}</span>
                      {item.reserved && <span style={{ color: C.text3, fontSize: '0.62rem' }}>Próximamente</span>}
                      {hasChildren && (
                        <ChevronDown size={11} style={{ transition: 'transform 200ms', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', color: C.text3 }} />
                      )}
                    </>
                  )}
                </button>

                {sidebarOpen && hasChildren && isExpanded && (
                  <div style={{ marginTop: 2, marginLeft: 14, paddingLeft: 12, borderLeft: `1.5px solid ${C.outlineVar}` }}>
                    {item.children!.map(child => {
                      const ChildIcon = child.icon;
                      const isChildActive = currentPath === child.path || currentPath.startsWith(child.path + '/');
                      return (
                        <a
                          key={child.id}
                          href={child.path}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            padding: '5px 10px',
                            borderRadius: 8,
                            transition: 'all 120ms ease',
                            background: isChildActive ? C.activeItem : 'transparent',
                            color: isChildActive ? C.activeText : C.text2,
                            textDecoration: 'none',
                            fontSize: '0.79rem',
                            fontWeight: isChildActive ? 600 : 400,
                            marginBottom: 1,
                          }}
                          onMouseEnter={e => { if (!isChildActive) { (e.currentTarget as HTMLElement).style.background = C.hoverItem; (e.currentTarget as HTMLElement).style.color = C.text1; } }}
                          onMouseLeave={e => { if (!isChildActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.text2; } }}
                        >
                          <ChildIcon size={12} style={{ flexShrink: 0 }} />
                          <span>{child.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* CTA Button + Footer */}
        <div style={{ padding: '10px 10px 6px', borderTop: `1px solid ${C.sidebarBorder}` }}>
          {sidebarOpen && (
            <button onClick={() => { setShowReadiness(true); void readiness.refetch(); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:7, padding:'8px 10px', marginBottom:6, borderRadius:9, border:`1px solid ${C.outline}`, background:C.surface2, color:C.text2, cursor:'pointer', fontSize:'0.76rem', fontWeight:600 }}>
              <Building2 size={13}/> Configurar infraestructura
            </button>
          )}
          {sidebarOpen && (
            <button
              onClick={() => router.push('/operaciones/tickets')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '9px 16px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background: C.ctaBg,
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
                marginBottom: 6,
                transition: 'background 140ms, transform 100ms',
                boxShadow: '0 2px 8px rgba(67,97,238,0.3)',
              }}
              onMouseEnter={e => { (e.currentTarget.style.background = C.ctaHover); (e.currentTarget.style.transform = 'translateY(-1px)'); }}
              onMouseLeave={e => { (e.currentTarget.style.background = C.ctaBg); (e.currentTarget.style.transform = 'translateY(0)'); }}
            >
              <Plus size={14} />
              Nuevo Ticket
            </button>
          )}
          <button
            onClick={() => router.push('/configuracion/preferencias')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: sidebarOpen ? '6px 10px' : '8px',
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: C.text3,
              fontSize: '0.79rem',
              fontWeight: 400,
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { (e.currentTarget.style.background = C.hoverItem); (e.currentTarget.style.color = C.text2); }}
            onMouseLeave={e => { (e.currentTarget.style.background = 'transparent'); (e.currentTarget.style.color = C.text3); }}
          >
            <HelpCircle size={14} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span>Ayuda y Soporte</span>}
          </button>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: sidebarOpen ? '6px 10px' : '8px',
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: C.danger,
              fontSize: '0.79rem',
              fontWeight: 400,
              transition: 'background 120ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = darkMode ? 'rgba(240,82,82,0.12)' : 'rgba(240,82,82,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <LogOut size={14} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* ══════════ MAIN ══════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Topbar */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 58,
          background: C.topbar,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${C.topbarBorder}`,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: darkMode ? 'none' : '0 1px 4px rgba(67,97,238,0.06)',
        }}>
          {/* Left: toggle + page title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'all 120ms' }}
              onMouseEnter={e => { (e.currentTarget.style.background = C.hoverItem); (e.currentTarget.style.color = C.text2); }}
              onMouseLeave={e => { (e.currentTarget.style.background = 'transparent'); (e.currentTarget.style.color = C.text3); }}
            >
              {sidebarOpen ? <X size={17} /> : <Menu size={17} />}
            </button>

            {title ? (
              <h1 style={{ color: C.text1, fontSize: '1.05rem', fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
            ) : breadcrumb ? (
              <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {breadcrumb.map((crumb, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ color: C.text3, fontSize: '0.78rem' }}>/</span>}
                    {crumb.path ? (
                      <a href={crumb.path} style={{ color: C.text3, textDecoration: 'none', fontSize: '0.82rem', fontWeight: 400, transition: 'color 120ms' }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.text3)}
                      >{crumb.label}</a>
                    ) : (
                      <span style={{ color: C.text1, fontSize: '0.82rem', fontWeight: 600 }}>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            ) : null}
          </div>

          {/* Center: Global Search */}
          <GlobalSearch darkMode={darkMode} C={C} />

          {/* Right: actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={darkMode ? 'Modo claro' : 'Modo oscuro'}
              style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 7, borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'all 120ms' }}
              onMouseEnter={e => { (e.currentTarget.style.background = C.hoverItem); (e.currentTarget.style.color = C.text2); }}
              onMouseLeave={e => { (e.currentTarget.style.background = 'transparent'); (e.currentTarget.style.color = C.text3); }}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Asistente IA */}
            <button
              onClick={() => setShowAI(true)}
              title="Asistente IA"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: showAI
                  ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)'
                  : 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: 10, padding: '6px 12px',
                color: showAI ? '#fff' : '#A78BFA',
                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                transition: 'all 150ms',
                boxShadow: showAI ? '0 0 12px rgba(139,92,246,0.4)' : 'none'
              }}
              onMouseEnter={e => {
                if (!showAI) {
                  (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.25))';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 0 8px rgba(139,92,246,0.3)';
                }
              }}
              onMouseLeave={e => {
                if (!showAI) {
                  (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }
              }}
            >
              <Sparkles size={14} />
              SKIA AI
            </button>

            {/* Notifications */}
            <button
              style={{ position: 'relative', background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 7, borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'all 120ms' }}
              onMouseEnter={e => { (e.currentTarget.style.background = C.hoverItem); (e.currentTarget.style.color = C.text2); }}
              onMouseLeave={e => { (e.currentTarget.style.background = 'transparent'); (e.currentTarget.style.color = C.text3); }}
            >
              <Bell size={17} />
              <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, background: C.notifDot, borderRadius: '50%', border: `2px solid ${C.topbar}` }} />
            </button>

            {/* Divider */}
            <div style={{ width: 1, height: 22, background: C.outlineVar, margin: '0 6px' }} />

            {/* User */}
            {user && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '5px 12px 5px 5px',
                borderRadius: 10,
                cursor: 'pointer',
                border: `1px solid ${C.userBorder}`,
                background: C.userBg,
                transition: 'border-color 140ms, box-shadow 140ms',
              }}
                onMouseEnter={e => { (e.currentTarget.style.borderColor = C.outline); (e.currentTarget.style.boxShadow = '0 2px 8px rgba(67,97,238,0.1)'); }}
                onMouseLeave={e => { (e.currentTarget.style.borderColor = C.userBorder); (e.currentTarget.style.boxShadow = 'none'); }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: `linear-gradient(135deg, ${C.primary}, #7B93F5)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(67,97,238,0.35)',
                }}>
                  <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>{user.name?.charAt(0)?.toUpperCase() ?? 'U'}</span>
                </div>
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ color: C.text1, fontSize: '0.8rem', fontWeight: 600 }}>{user.name}</div>
                  <div style={{ color: C.text3, fontSize: '0.66rem' }}>{user.email}</div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
          {children}
        </main>
      </div>
    </div>

    {/* Asistente IA Modal */}
    {showAI && (
      <AsistenteIA
        userName={user?.name ?? 'Usuario'}
        onClose={() => setShowAI(false)}
      />
    )}
    {showReadiness && (
      <InfrastructureReadinessWizard data={readiness.data} loading={readiness.loading} error={readiness.error} darkMode={darkMode} onClose={closeReadiness} onRetry={() => { void readiness.refetch(); }} onAction={runReadinessAction}/>
    )}
    </>
  );
}
