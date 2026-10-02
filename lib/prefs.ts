"use client";

import { useSyncExternalStore } from "react";
import { PREF_KEYS as KEYS } from "./prefs-keys";

// Viewer preferences, stored in localStorage. Both default to off.
// reduceMotion forces reduced motion on; when off, the system setting decides.
export type Prefs = { sound: boolean; reduceMotion: boolean };

const DEFAULTS: Prefs = { sound: false, reduceMotion: false };

const listeners = new Set<() => void>();
let cache: Prefs | null = null;

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function read(): Prefs {
  if (cache) return cache;
  cache = { sound: readFlag(KEYS.sound), reduceMotion: readFlag(KEYS.reduceMotion) };
  return cache;
}

export function getPrefs(): Prefs {
  return typeof window === "undefined" ? DEFAULTS : read();
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  try {
    window.localStorage.setItem(KEYS[key], value ? "1" : "0");
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  cache = { ...read(), [key]: value };
  if (key === "reduceMotion") {
    if (value) document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEYS.sound || e.key === KEYS.reduceMotion) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULTS);
}

// True when motion should be reduced, from either the override or the system.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return getPrefs().reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeMotion(listener: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", listener);
  const unsubscribe = subscribe(listener);
  return () => {
    mq.removeEventListener("change", listener);
    unsubscribe();
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => false);
}
