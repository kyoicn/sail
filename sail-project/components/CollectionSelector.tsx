"use client";

import React, { useEffect, useState } from 'react';
import { Loader2, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

interface CollectionSelectorProps {
  selectedCollection: string | null;
  onSelect: (collection: string | null) => void;
  dataset: string; // [NEW] Added dataset prop
}

export function CollectionSelector({ selectedCollection, onSelect, dataset }: CollectionSelectorProps) {
  const [collections, setCollections] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch collections on mount
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
  }, [dataset]); // Re-fetch when dataset changes

  if (collections.length === 0 && !isLoading) return null;

  return (
    <div className="relative group pointer-events-auto">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all shadow-sm border",
          selectedCollection
            ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            : "bg-white/90 backdrop-blur-md text-slate-600 border-white/50 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        <Filter className="w-4 h-4" />
        {selectedCollection || "All Collections"}
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close */}
          <div
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute top-full left-0 mt-2 w-56 bg-white/90 backdrop-blur-xl rounded-xl shadow-xl border border-white/50 overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-100">
            <div className="p-1 max-h-[300px] overflow-y-auto">
              <button
                onClick={() => { onSelect(null); setIsOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                  !selectedCollection ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                All Collections
              </button>

              <div className="h-px bg-slate-100 my-1" />

              {isLoading ? (
                <div className="flex items-center justify-center py-4 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                collections.map(col => (
                  <button
                    key={col}
                    onClick={() => { onSelect(col); setIsOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate",
                      selectedCollection === col
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {col}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
