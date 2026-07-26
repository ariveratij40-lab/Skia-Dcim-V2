import { useState } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

interface SidebarSubItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  path: string;
}

interface SidebarItemProps {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  children?: SidebarSubItem[];
  sidebarOpen: boolean;
  darkMode: boolean;
  expandedItems: Set<string>;
  onToggleExpand: (itemId: string) => void;
}

/**
 * SidebarItem - Componente individual del sidebar
 * Soporta expansión/colapso para subitems
 * Preparado para RBAC dinámico
 */
export function SidebarItem({
  id,
  label,
  icon: Icon,
  path,
  children,
  sidebarOpen,
  darkMode,
  expandedItems,
  onToggleExpand,
}: SidebarItemProps) {
  const hasChildren = children && children.length > 0;
  const isExpanded = expandedItems.has(id);

  const handleClick = () => {
    if (hasChildren) {
      onToggleExpand(id);
    } else if (path) {
      window.location.href = path;
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 font-semibold text-sm ${
          darkMode
            ? 'hover:bg-[#F1F4FB] text-[#5C6194] hover:text-white'
            : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'
        }`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {sidebarOpen && (
          <>
            <span className="flex-1 text-left uppercase tracking-wide text-xs">{label}</span>
            {hasChildren && (
              <ChevronDown
                className={`w-4 h-4 transform transition-transform duration-200 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            )}
          </>
        )}
      </button>

      {/* Subitems */}
      {sidebarOpen && hasChildren && isExpanded && (
        <div className="ml-6 space-y-1 mt-1">
          {children.map((child) => (
            <a
              key={child.id}
              href={child.path}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 uppercase tracking-wide ${
                darkMode
                  ? 'hover:bg-[#F1F4FB] text-gray-400 hover:text-[#5C6194]'
                  : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              {child.icon && <child.icon className="w-4 h-4" />}
              {child.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarGroupProps {
  title?: string;
  items: SidebarItemProps[];
  sidebarOpen: boolean;
  darkMode: boolean;
  expandedItems: Set<string>;
  onToggleExpand: (itemId: string) => void;
}

/**
 * SidebarGroup - Agrupa múltiples SidebarItems
 * Soporta títulos de sección
 * Preparado para renderizado desde API
 */
export function SidebarGroup({
  title,
  items,
  sidebarOpen,
  darkMode,
  expandedItems,
  onToggleExpand,
}: SidebarGroupProps) {
  return (
    <div>
      {/* Section Title */}
      {title && sidebarOpen && (
        <div className="px-4 py-3 mt-4 first:mt-0">
          <p
            className={`text-xs font-bold uppercase tracking-widest ${
              darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            {title}
          </p>
        </div>
      )}

      {/* Items */}
      <div className="space-y-1">
        {items.map((item) => (
          <SidebarItem
            key={item.id}
            {...item}
            sidebarOpen={sidebarOpen}
            darkMode={darkMode}
            expandedItems={expandedItems}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>
    </div>
  );
}

interface SidebarContainerProps {
  children: React.ReactNode;
  sidebarOpen: boolean;
  darkMode: boolean;
}

/**
 * SidebarContainer - Contenedor principal del sidebar
 * Maneja estilos generales y animaciones
 */
export function SidebarContainer({
  children,
  sidebarOpen,
  darkMode,
}: SidebarContainerProps) {
  return (
    <div
      className={`${
        sidebarOpen ? 'w-64' : 'w-20'
      } ${
        darkMode ? 'bg-white border-[#E8EBF4]' : 'bg-white border-gray-200'
      } border-r-2 transition-all duration-300 flex flex-col h-screen`}
    >
      {children}
    </div>
  );
}

interface SidebarNavProps {
  children: React.ReactNode;
}

/**
 * SidebarNav - Contenedor de navegación
 * Soporta scroll y overflow
 */
export function SidebarNav({ children }: SidebarNavProps) {
  return <nav className="flex-1 px-3 space-y-1 overflow-y-auto">{children}</nav>;
}

interface SidebarFooterProps {
  children: React.ReactNode;
  darkMode: boolean;
}

/**
 * SidebarFooter - Pie del sidebar
 * Contiene botones de tema y logout
 */
export function SidebarFooter({ children, darkMode }: SidebarFooterProps) {
  return (
    <div
      className={`border-t-2 ${
        darkMode ? 'border-[#E8EBF4]' : 'border-gray-200'
      } p-3 space-y-2`}
    >
      {children}
    </div>
  );
}

interface SidebarLogoProps {
  sidebarOpen: boolean;
  darkMode: boolean;
}

/**
 * SidebarLogo - Logo del sidebar
 * Soporta modo colapsado/expandido
 */
export function SidebarLogo({ sidebarOpen, darkMode }: SidebarLogoProps) {
  return (
    <div className={`p-4 flex items-center justify-between ${!sidebarOpen && 'justify-center'}`}>
      {sidebarOpen ? (
        <img src="/logo-skia.jpg" alt="SKIA" className="h-12 object-contain" />
      ) : (
        <div className="w-10 h-10 bg-gradient-to-br from-blue-700 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className={`text-white font-bold text-sm`}>SK</span>
        </div>
      )}
    </div>
  );
}
