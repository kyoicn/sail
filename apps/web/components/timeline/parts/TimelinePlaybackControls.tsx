import React from 'react';
import { Play, Pause, ArrowLeft } from 'lucide-react';

interface TimelinePlaybackControlsProps {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  interactionMode: 'exploration' | 'investigation' | 'playback';
  setInteractionMode: (mode: 'exploration' | 'investigation' | 'playback') => void;
  setCurrentDate: (date: number) => void;
  viewRange: { min: number, max: number };
  onManualStep: () => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
}

export const TimelinePlaybackControls: React.FC<TimelinePlaybackControlsProps> = ({
  isPlaying,
  setIsPlaying,
  interactionMode,
  setInteractionMode,
  setCurrentDate,
  viewRange,
  onManualStep,
  playbackSpeed,
  setPlaybackSpeed
}) => {
  return (
    <div className="flex flex-col items-center gap-1 relative">
      {/* Back Button (Absolute Left of the Play Button) */}
      {interactionMode !== 'exploration' && (
        <button
          onClick={() => setInteractionMode('exploration')}
          className="group absolute right-full top-0 mr-2 flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-blue-500 hover:border-blue-200 hover:bg-slate-50 transition-all shadow-sm"
          title="Back to Range"
        >
          <ArrowLeft size={16} className="transition-colors" />
        </button>
      )}

      {/* Play/Pause Button */}
      <button
        onClick={() => {
          if (!isPlaying) {
            if (interactionMode !== 'playback') {
              setCurrentDate(viewRange.min);
              setInteractionMode('playback');
            }
            setIsPlaying(true);
          } else {
            setIsPlaying(false);
          }
        }}
        className={`group flex items-center justify-center w-8 h-8 rounded-lg border transition-all shadow-sm z-10
                ${isPlaying
            ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
            : 'bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-slate-50'}`}
        title={isPlaying ? "Pause Playback" : "Start Playback"}
      >
        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>

      {/* Speed Control Button */}
      {interactionMode === 'playback' && (
        <button
          onClick={() => {
            const next = playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : 1;
            setPlaybackSpeed(next);
          }}
          className="flex items-center justify-center w-8 h-5 rounded-md border border-slate-200 bg-white text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-slate-50 transition-all shadow-sm"
          title="Playback Speed"
        >
          {playbackSpeed}x
        </button>
      )}
    </div>
  );
};
