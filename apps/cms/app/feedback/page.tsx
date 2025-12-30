'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageSquare,
  Clock,
  Globe,
  Monitor,
  User,
  Archive,
  CheckCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { getDataset } from '@sail/shared';

interface FeedbackItem {
  id: string;
  message: string;
  email: string | null;
  status: 'new' | 'read' | 'archived';
  context: {
    ip?: string;
    url?: string;
    os?: string;
    browser?: string;
    language?: string;
    user_agent?: string;
  };
  created_at: string;
}

export default function FeedbackDashboard() {
  const [dataset, setDataset] = useState<'prod' | 'staging' | 'dev'>((getDataset() as any) || 'prod');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'read' | 'archived'>('all');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    console.log('[CMS Feedback Dashboard] Detected Dataset:', getDataset());
  }, []);

  const fetchFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/feedback?dataset=${dataset}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch feedback');
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [dataset, statusFilter]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, dataset, status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');

      // Update local state
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, status: newStatus as any } : item
      ));

      // If we are filtering, we might need to remove it from view
      if (statusFilter !== 'all' && statusFilter !== newStatus) {
        setItems(prev => prev.filter(item => item.id !== id));
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="text-blue-600" size={24} />
              Feedback Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value as any)}
              className="bg-gray-100 border-none rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="prod">Production</option>
              <option value="staging">Staging</option>
              <option value="dev">Development</option>
            </select>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <div className="flex items-center gap-2 mb-6 bg-white p-1 rounded-xl border border-gray-200 shadow-sm inline-flex">
          {(['all', 'new', 'read', 'archived'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${statusFilter === f
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p>Loading feedback...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={32} />
            <h3 className="text-red-900 font-semibold mb-1">Error Loading Data</h3>
            <p className="text-red-700 text-sm mb-4">{error}</p>
            <button
              onClick={fetchFeedback}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-20 text-center shadow-sm">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <MessageSquare size={32} />
            </div>
            <h3 className="text-gray-900 font-semibold mb-1">No Feedback Found</h3>
            <p className="text-gray-500 text-sm">Feedback for this dataset and filter will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md ${item.status === 'new' ? 'border-blue-200 ring-1 ring-blue-50' : 'border-gray-200'
                  }`}
              >
                <div className="p-5 flex flex-col md:flex-row gap-6">
                  {/* Left Column: Message */}
                  <div className="flex-grow">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${item.status === 'new' ? 'bg-blue-100 text-blue-700' :
                        item.status === 'read' ? 'bg-gray-100 text-gray-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={12} />
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap mb-4">
                      {item.message}
                    </p>

                    {item.email && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <User size={12} />
                        <a href={`mailto:${item.email}`} className="text-blue-600 hover:underline">{item.email}</a>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Context & Actions */}
                  <div className="md:w-72 flex-shrink-0 flex flex-col justify-between border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6">
                    <div className="space-y-3 mb-6">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Context</h4>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Globe size={14} className="text-gray-400" />
                          <span className="truncate" title={item.context.url}>
                            {item.context.url ? new URL(item.context.url).pathname : 'Direct'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Monitor size={14} className="text-gray-400" />
                          <span>{item.context.browser} on {item.context.os}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <CheckCircle size={14} />
                          <span>IP: {item.context.ip}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {item.status !== 'read' && (
                        <button
                          disabled={updatingId === item.id}
                          onClick={() => handleUpdateStatus(item.id, 'read')}
                          className="flex-grow flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
                        >
                          {updatingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                          Mark Read
                        </button>
                      )}

                      {item.status !== 'archived' ? (
                        <button
                          disabled={updatingId === item.id}
                          onClick={() => handleUpdateStatus(item.id, 'archived')}
                          className="px-3 py-2 bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50"
                          title="Archive"
                        >
                          <Archive size={14} />
                        </button>
                      ) : (
                        <button
                          disabled={updatingId === item.id}
                          onClick={() => handleUpdateStatus(item.id, 'new')}
                          className="px-3 py-2 bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50"
                          title="Unarchive"
                        >
                          <ChevronRight size={14} className="rotate-180" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
