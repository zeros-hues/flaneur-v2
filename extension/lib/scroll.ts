const MAX_STEPS = 80;

const pause = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 300 + Math.random() * 300);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

// The page may scroll on the document or inside main#workspace; use whichever actually scrolls.
function scrollContainer(): Element {
  const main = document.querySelector("main#workspace");
  if (main && main.scrollHeight > main.clientHeight + 1) {
    const overflow = getComputedStyle(main).overflowY;
    if (overflow === "auto" || overflow === "scroll") return main;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Scrolls to the bottom in viewport-sized steps with 300–600ms pauses so lazy
 * sections render, stops once the page stops growing, then returns to the top.
 */
export async function scrollThrough(signal: AbortSignal): Promise<void> {
  const el = scrollContainer();
  let lastHeight = -1;

  for (let step = 0; step < MAX_STEPS && !signal.aborted; step++) {
    el.scrollBy({ top: el.clientHeight * 0.8 });
    await pause(signal);
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    if (atBottom && el.scrollHeight === lastHeight) break;
    lastHeight = el.scrollHeight;
  }

  el.scrollTo({ top: 0 });
}
