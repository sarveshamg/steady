"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/* Minimal YouTube IFrame API wrapper: embed, report duration and time, seek on demand. */

type YTPlayer = {
  seekTo: (s: number, allowSeekAhead: boolean) => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        if (window.YT) resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export type YouTubeHandle = { seekTo: (seconds: number) => void };

export const YouTubePlayer = forwardRef<
  YouTubeHandle,
  { videoId: string; onDuration: (d: number) => void; onTime: (t: number) => void }
>(function YouTubePlayer({ videoId, onDuration, onTime }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);

  useImperativeHandle(ref, () => ({
    seekTo: (s: number) => {
      player.current?.seekTo(s, true);
      player.current?.pauseVideo();
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    loadApi().then((YT) => {
      if (cancelled || !host.current) return;
      player.current = new YT.Player(host.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            onDuration(player.current?.getDuration() || 0);
            timer = setInterval(() => {
              const t = player.current?.getCurrentTime();
              if (typeof t === "number") onTime(t);
            }, 500);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      player.current?.destroy();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl bg-ink">
      <div ref={host} className="h-full w-full" />
    </div>
  );
});
