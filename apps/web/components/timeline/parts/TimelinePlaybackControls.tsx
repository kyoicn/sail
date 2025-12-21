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
    <div className="absolute left-0 top-0 flex items-center gap-2">
      <button
        onClick={() => {
          if (!isPlaying) {
            // Enter Play Mode
            // If switching from another mode, reset to start. If already in playback, just resume.
            if (interactionMode !== 'playback') {
              setCurrentDate(viewRange.min);
              setInteractionMode('playback');
            }
            setIsPlaying(true);
          } else {
            // Pause Playback
            setIsPlaying(false);
          }
        }}
        className={`p-2 rounded-full shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 
                ${isPlaying ? 'bg-black/5 text-slate-600 hover:bg-black/10' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        title={isPlaying ? "Pause Playback" : "Start Playback"}
      >
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
      </button>

      {/* Next Step Button (Only in Playback Mode) */}
      {interactionMode === 'playback' && (
        <button
          onClick={onManualStep}
          disabled={isPlaying}
          className={`p-2 rounded-full shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 animate-in fade-in slide-in-from-left-4
                  ${isPlaying
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          title="Next Step"
        >
          <ArrowRight size={20} />
        </button>
      )}
    </div>
  );
};
