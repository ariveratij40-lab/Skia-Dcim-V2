'use client';

import React, { useState, useEffect } from 'react';
import { useNavigation } from '@/providers/SkiaContextProvider';
import { Search, X } from 'lucide-react';

interface CommandPaletteProps {
  onClose: () => void;
}

export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const { navigationItems } = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<any[]>([]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredItems([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: any[] = [];

    navigationItems.forEach((item) => {
      if (item.label.toLowerCase().includes(query)) {
        results.push(item);
      }
      if (item.children) {
        item.children.forEach((child: any) => {
          if (child.label.toLowerCase().includes(query)) {
            results.push(child);
          }
        });
      }
    });

    setFilteredItems(results);
  }, [searchQuery, navigationItems]);

  const handleSelect = (item: any) => {
    if (item.path && item.path !== '#') {
      window.location.href = item.path;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-xl">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search size={20} className="text-slate-400" />
          <input
            type="text"
            placeholder="Buscar en SKIA..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          />
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {filteredItems.length > 0 ? (
            <div className="py-2">
              {filteredItems.map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-400">
                    {item.label.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.path}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : searchQuery.trim() !== '' ? (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400">
              <p>No se encontraron resultados para "{searchQuery}"</p>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400">
              <p>Escribe para buscar...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>Presiona ESC para cerrar</span>
          <span>↵ Seleccionar</span>
        </div>
      </div>
    </div>
  );
}
