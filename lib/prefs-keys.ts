// Shared by the client prefs module and the server layout's boot script.
export const PREF_KEYS = { sound: "flaneur:sound", reduceMotion: "flaneur:reduce-motion" } as const;

// Runs before first paint (inlined in the root layout) so CSS sees the motion override immediately.
export const MOTION_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  PREF_KEYS.reduceMotion,
)})==="1")document.documentElement.dataset.motion="reduce"}catch(e){}`;
