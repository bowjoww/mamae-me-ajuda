"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useTextToSpeech(): {
  playingIndex: number | null;
  loadingAudio: number | null;
  speak: (text: string, index: number) => Promise<void>;
} {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const speak = useCallback(
    async (text: string, index: number) => {
      if (playingIndex === index) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        setPlayingIndex(null);
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      setLoadingAudio(index);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) {
          setLoadingAudio(null);
          return;
        }

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          setPlayingIndex(null);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        audioRef.current = audio;
        setLoadingAudio(null);
        setPlayingIndex(index);

        try {
          await audio.play();
        } catch {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          setPlayingIndex(null);
        }
      } catch {
        setLoadingAudio(null);
        setPlayingIndex(null);
      }
    },
    [playingIndex]
  );

  return { playingIndex, loadingAudio, speak };
}
