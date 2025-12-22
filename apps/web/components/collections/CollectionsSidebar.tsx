"use client";

import React, { useEffect, useState } from 'react';
import { Loader2, Hash } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CollectionsSidebarProps {
  selectedCollection: string | null;
  onSelect: (collection: string | null) => void;
  dataset: string;
}

export function CollectionsSidebar({ selectedCollection, onSelect, dataset }: CollectionsSidebarProps) {
  const [collections, setCollections] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCollections() {
      try {
        const res = await fetch(`/api/collections?dataset=${dataset}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setCollections(data);
      } catch (err) {
        console.error('Failed to load collections', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchCollections();
  }, [dataset]);

  if (collections.length === 0 && !isLoading) return null;

  return (
    <div className="fixed left-6 top-[88px] z-10 w-48 bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 overflow-hidden flex flex-col p-2 gap-2 animate-in fade-in slide-in-from-left-4 duration-500">
      <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
        <Hash className="w-3 h-3 text-slate-400" />
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Collections
        </h3>
      </div>

      <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          collections.map(col => (
            <button
              key={col}
              onClick={() => onSelect(col === selectedCollection ? null : col)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-lg text-xs transition-all duration-200 border",
                selectedCollection === col
                  ? "bg-blue-50 text-blue-700 font-semibold border-blue-200 shadow-sm translate-x-1"
                  : "bg-transparent text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{col}</span>
                {selectedCollection === col && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
