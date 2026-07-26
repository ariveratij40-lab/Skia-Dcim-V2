'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSkiaContext, useNavigation } from '@/providers/SkiaContextProvider';
import { ChevronDown, LayoutDashboard } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

export default function Sidebar({ isOpen }: SidebarProps) {
  const { currentTenant, navigationItems } = useSkiaContext();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['infraestructura']));

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        {isOpen ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-900 dark:text-white">SKIA</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">DCIM Platform</p>
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-lg">S</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {navigationItems.map((item) => (
          <div key={item.id}>
            {item.divider ? (
              <div className="my-4 border-t border-slate-200 dark:border-slate-800" />
            ) : (
              <>
                <button
                  onClick={() => item.children && toggleExpanded(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    item.children && expandedItems.has(item.id)
                      ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="w-5 h-5 flex-shrink-0">
                    {item.icon === 'LayoutDashboard' && <LayoutDashboard size={20} />}
                    {/* Agregar más iconos según sea necesario */}
                  </span>
                  {isOpen && (
                    <>
                      <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                      {item.children && (
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${
                            expandedItems.has(item.id) ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </>
                  )}
                </button>

                {/* Subitems */}
                {item.children && expandedItems.has(item.id) && isOpen && (
                  <div className="ml-4 space-y-1">
                    {item.children.map((subitem) => (
                      <Link
                        key={subitem.id}
                        href={subitem.path}
                        className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className="w-4 h-4 flex-shrink-0 rounded bg-slate-200 dark:bg-slate-700" />
                        <span>{subitem.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {isOpen && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <p className="font-semibold">{currentTenant?.name}</p>
            <p>v1.0.0</p>
          </div>
        </div>
      )}
    </>
  );
}
