import React from 'react';
import { Play, Pause, ArrowRight } from 'lucide-react';

interface TimelinePlaybackControlsProps {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  interactionMode: 'exploration' | 'investigation' | 'playback';
  setInteractionMode: (mode: 'exploration' | 'investigation' | 'playback') => void;
  setCurrentDate: (date: number) => void;
  viewRange: { min: number, max: number };
  onManualStep: () => void;
}

export const TimelinePlaybackControls: React.FC<TimelinePlaybackControlsProps> = ({
  isPlaying,
  setIsPlaying,
  interactionMode,
  setInteractionMode,
  setCurrentDate,
  viewRange,
  onManualStep
}) => {
  return (
    <div className="flex items-center gap-1">
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
        className={`group flex items-center justify-center w-8 h-8 rounded-lg border transition-all shadow-sm
                ${isPlaying
            ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
            : 'bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-slate-50'}`}
        title={isPlaying ? "Pause Playback" : "Start Playback"}
      >
        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>

      {/* Next Step Button (Only in Playback Mode) */}
      {interactionMode === 'playback' && (
        <button
          onClick={onManualStep}
          disabled={isPlaying}
          className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all shadow-sm animate-in fade-in slide-in-from-left-2
                  ${isPlaying
              ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-slate-50'}`}
          title="Next Step"
        >
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
};
