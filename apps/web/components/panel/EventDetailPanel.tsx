import React from 'react';
import { X, ExternalLink, Calendar, MapPin, BookOpen, Crosshair } from 'lucide-react';
import { EventData } from '@sail/shared';
import { formatChronosTime } from '../../lib/time-engine';
import { getLocationString } from '../../lib/utils';

interface EventDetailPanelProps {
    event: EventData | null;
    isOpen: boolean;
    onClose: () => void;
    onEnterFocusMode: (event: EventData) => void;
}

/**
 * EventDetailPanel Component
 * ------------------------------------------------------------------
 * A slide-over panel that displays detailed information about a selected event.
 */
export const EventDetailPanel: React.FC<EventDetailPanelProps> = ({
    event,
    isOpen,
    onClose,
    onEnterFocusMode
}) => {
    const content = event ? (
        <>
            {/* 1. Hero Image */}
            <div className="relative h-64 w-full bg-slate-100 shrink-0">
                {event.imageUrl ? (
                    <div
                        className="w-full h-full bg-cover bg-center"
                        style={{ backgroundImage: `url('${event.imageUrl}')` }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <span className="text-sm">No Image Available</span>
                    </div>
                )}
                <div className="absolute top-4 right-16 z-10">
                    {event.children && event.children.length > 0 && (
                        <button
                            onClick={() => onEnterFocusMode(event)}
                            className="flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg hover:bg-blue-50 hover:text-blue-600 text-slate-700 font-bold text-xs uppercase tracking-wide transition-all border border-slate-200/50"
                            title="Focus on this event's timeline"
                        >
                            <span>Focus</span>
                        </button>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg hover:bg-white text-slate-600 transition-all z-10"
                >
                    <X size={20} />
                </button>
            </div>

            {/* 2. Scrollable Content */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6">

                {/* Header */}
                <div>
                    <h2 className="text-3xl font-black text-slate-800 leading-tight mb-2">{event.title}</h2>

                    <div className="flex flex-col gap-2 text-sm text-slate-600 mt-3">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-blue-500" />
                            <span className="font-medium text-slate-900">
                                {event.end
                                    ? `${formatChronosTime(event.start)} – ${formatChronosTime(event.end)}`
                                    : formatChronosTime(event.start)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin size={16} className="text-blue-500" />
                            <span>{getLocationString(event)}</span>
                        </div>
                    </div>
                </div>

                <hr className="border-slate-100" />

                {/* Description */}
                <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Description</h3>
                    <p className="text-slate-700 leading-relaxed text-lg">
                        {event.summary}
                    </p>
                </div>

                {/* [UPDATED] Sources Links */}
                {event.sources && event.sources.length > 0 && (
                    <div className="pt-4">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Sources</h3>
                        <div className="flex flex-col gap-2">
                            {event.sources.map((source, idx) => (
                                <a
                                    key={idx}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <BookOpen size={18} className="text-slate-500" />
                                        <span className="font-medium text-slate-700">Read on {source.label}</span>
                                    </div>
                                    <ExternalLink size={16} className="text-slate-400 group-hover:text-blue-500" />
                                </a>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </>
    ) : null;

    return (
        <div
            className={`fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-white shadow-2xl transform transition-transform duration-500 cubic-bezier(0.25, 1, 0.5, 1) flex flex-col border-l border-slate-100
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
            {content}
        </div>
    );
};