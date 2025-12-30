'use client';

import React, { useState } from 'react';
import { X, MessageSquare, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppConfig } from '../../hooks/useAppConfig';

export default function FeedbackModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { dataset } = useAppConfig();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, email, website, dataset }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      setStatus('success');
      setTimeout(() => {
        setIsOpen(false);
        setStatus('idle');
        setMessage('');
        setEmail('');
        setWebsite('');
      }, 2000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 p-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 border border-zinc-200 dark:border-zinc-700 group"
        title="Send Feedback"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-in-out whitespace-nowrap ml-0 group-hover:ml-2 text-sm font-medium">
          Feedback
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Send Feedback</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* content */}
        <div className="p-6">
          {status === 'success' ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Thank you!</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Your feedback helps us improve.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Message */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Message</label>
                <textarea
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind? Found a bug? Feature idea?"
                  className="w-full min-h-[120px] p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              {/* Email (Optional) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Email (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="If you'd like a reply..."
                  className="w-full p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              {/* HONEYPOT - Hidden Field */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                style={{
                  opacity: 0,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: 0,
                  width: 0,
                  zIndex: -1,
                }}
              />

              {/* Error Message */}
              {status === 'error' && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  <span>Something went wrong. Please try again.</span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Sending...' : 'Send Feedback'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
