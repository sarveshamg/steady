"use client";

import { useEffect, useState, type RefObject } from "react";
import { MaximizeIcon, PauseIcon, PlayIcon, VolumeIcon, VolumeOffIcon } from "./icons";

/**
 * Play / mute / fullscreen for the uploaded video. The native progress bar is replaced by HazardTimeline, so the
 * <video> has no `controls` attribute; in fullscreen we switch native controls on, so there's always a way out.
 */
export function VideoControls({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const sync = () => {
      setPlaying(!v.paused);
      setMuted(v.muted || v.volume === 0);
    };
    const onFs = () => {
      v.controls = document.fullscreenElement === v;
    };
    sync();
    v.addEventListener("play", sync);
    v.addEventListener("pause", sync);
    v.addEventListener("volumechange", sync);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      v.removeEventListener("play", sync);
      v.removeEventListener("pause", sync);
      v.removeEventListener("volumechange", sync);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [video]);

  const btn =
    "press grid h-11 w-11 place-content-center rounded-md text-ink hover:bg-primary-soft active:bg-line";

  return (
    <div className="mt-2 flex items-center gap-1" role="group" aria-label="Video controls">
      <button
        type="button"
        className={btn}
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => {
          const v = video.current;
          if (!v) return;
          if (v.paused) v.play().catch(() => {});
          else v.pause();
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        className={btn}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        onClick={() => {
          const v = video.current;
          if (v) v.muted = !v.muted;
        }}
      >
        {muted ? <VolumeOffIcon /> : <VolumeIcon />}
      </button>
      <span className="flex-1" />
      <button
        type="button"
        className={btn}
        aria-label="Full screen"
        onClick={() => video.current?.requestFullscreen?.().catch(() => {})}
      >
        <MaximizeIcon />
      </button>
    </div>
  );
}
