'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PlayableTrack } from '@/lib/types';

interface PlayerState {
  track: PlayableTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  repeat: boolean;
  loading: boolean;
  error: string | null;
}

interface PlayerApi extends PlayerState {
  play: (track: PlayableTrack) => void;
  toggle: (track?: PlayableTrack) => void;
  seekRatio: (ratio: number) => void;
  seekTo: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  close: () => void;
  isCurrent: (id: string) => boolean;
  progressOf: (id: string) => number;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

const VOLUME_KEY = 'sonora:volume';
const PLAY_THRESHOLD_SECONDS = 5;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const countedRef = useRef<Set<string>>(new Set());
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);

  const [state, setState] = useState<PlayerState>({
    track: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    muted: false,
    repeat: false,
    loading: false,
    error: null,
  });

  /* ----- element bootstrap ----- */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    const saved = window.localStorage.getItem(VOLUME_KEY);
    const stored = saved === null ? Number.NaN : Number(saved);
    if (Number.isFinite(stored) && stored >= 0 && stored <= 1) {
      audio.volume = stored;
      setState((s) => ({ ...s, volume: stored }));
    }

    const onTime = () => {
      const t = audio.currentTime;
      // Only accumulate forward, continuous playback (ignores seeks).
      const delta = t - lastTimeRef.current;
      if (delta > 0 && delta < 1.5) listenedRef.current += delta;
      lastTimeRef.current = t;
      let buffered = 0;
      if (audio.buffered.length && audio.duration) {
        buffered = audio.buffered.end(audio.buffered.length - 1) / audio.duration;
      }
      setState((s) => ({ ...s, currentTime: t, buffered }));
    };
    const onLoaded = () =>
      setState((s) => ({
        ...s,
        duration: Number.isFinite(audio.duration) ? audio.duration : s.duration,
        loading: false,
      }));
    const onPlay = () => setState((s) => ({ ...s, playing: true, error: null }));
    const onPause = () => setState((s) => ({ ...s, playing: false }));
    const onWaiting = () => setState((s) => ({ ...s, loading: true }));
    const onPlaying = () => setState((s) => ({ ...s, loading: false, playing: true }));
    const onEnded = () => setState((s) => ({ ...s, playing: false, currentTime: 0 }));
    const onError = () =>
      setState((s) => ({
        ...s,
        playing: false,
        loading: false,
        error: 'This track could not be played. Check your connection and try again.',
      }));
    const onVolume = () =>
      setState((s) => ({ ...s, volume: audio.volume, muted: audio.muted }));

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('progress', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('volumechange', onVolume);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('progress', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('volumechange', onVolume);
    };
  }, []);

  /* ----- play counting ----- */
  const trackIdRef = useRef<string | null>(null);
  useEffect(() => {
    trackIdRef.current = state.track?.id ?? null;
  }, [state.track?.id]);

  useEffect(() => {
    const id = state.track?.id;
    if (!id || countedRef.current.has(id)) return;
    const threshold = Math.min(PLAY_THRESHOLD_SECONDS, Math.max(1, (state.duration || 30) * 0.2));
    if (listenedRef.current < threshold) return;
    countedRef.current.add(id);
    fetch(`/api/tracks/${id}/play`, { method: 'POST', keepalive: true }).catch(() => {
      countedRef.current.delete(id);
    });
  }, [state.currentTime, state.track?.id, state.duration]);

  /* ----- repeat ----- */
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.loop = state.repeat;
  }, [state.repeat]);

  /* ----- media session (lock screen controls on mobile) ----- */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const t = state.track;
    if (!t) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      artwork: t.coverUrl ? [{ src: t.coverUrl, sizes: '512x512' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
  }, [state.track]);

  const play = useCallback((track: PlayableTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    const isSame = trackIdRef.current === track.id;
    if (!isSame) {
      listenedRef.current = 0;
      lastTimeRef.current = 0;
      audio.src = `/api/stream/${track.id}`;
      audio.load();
      setState((s) => ({
        ...s,
        track,
        currentTime: 0,
        buffered: 0,
        duration: track.duration || 0,
        loading: true,
        error: null,
      }));
    } else {
      setState((s) => ({ ...s, track, error: null }));
    }
    audio.play().catch(() => {
      setState((s) => ({ ...s, playing: false, loading: false }));
    });
  }, []);

  const toggle = useCallback(
    (track?: PlayableTrack) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (track && trackIdRef.current !== track.id) {
        play(track);
        return;
      }
      if (audio.paused) {
        audio.play().catch(() => setState((s) => ({ ...s, playing: false })));
      } else {
        audio.pause();
      }
    },
    [play]
  );

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : undefined;
    const value = max ? Math.min(Math.max(0, seconds), Math.max(0, max - 0.05)) : Math.max(0, seconds);
    try {
      audio.currentTime = value;
      lastTimeRef.current = value;
      setState((s) => ({ ...s, currentTime: value }));
    } catch {
      /* seeking before metadata is ready */
    }
  }, []);

  const seekRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      const duration =
        audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : state.duration;
      if (!duration) return;
      seekTo(ratio * duration);
    },
    [seekTo, state.duration]
  );

  const setVolume = useCallback((v: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Math.min(1, Math.max(0, v));
    audio.volume = value;
    if (value > 0) audio.muted = false;
    window.localStorage.setItem(VOLUME_KEY, String(value));
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
  }, []);

  const toggleRepeat = useCallback(() => setState((s) => ({ ...s, repeat: !s.repeat })), []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    listenedRef.current = 0;
    lastTimeRef.current = 0;
    setState((s) => ({
      ...s,
      track: null,
      playing: false,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      loading: false,
      error: null,
    }));
  }, []);

  const isCurrent = useCallback((id: string) => state.track?.id === id, [state.track?.id]);

  const progressOf = useCallback(
    (id: string) => {
      if (state.track?.id !== id) return 0;
      const d = state.duration || state.track?.duration || 0;
      return d > 0 ? Math.min(1, state.currentTime / d) : 0;
    },
    [state.track, state.duration, state.currentTime]
  );

  const value = useMemo<PlayerApi>(
    () => ({
      ...state,
      play,
      toggle,
      seekRatio,
      seekTo,
      setVolume,
      toggleMute,
      toggleRepeat,
      close,
      isCurrent,
      progressOf,
    }),
    [state, play, toggle, seekRatio, seekTo, setVolume, toggleMute, toggleRepeat, close, isCurrent, progressOf]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
