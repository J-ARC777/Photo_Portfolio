// Motion helper. Page-to-page navigation is a plain load (no cross-document
// transition); instead each page fades its elements in on arrival (the `.fade-in`
// class + staggered animation-delay, applied where content is built).

export function prefersReduced() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Add a staggered fade-in to an element (no-op under reduced motion — the CSS
// global block already collapses the duration, but we also skip the delay).
export function fadeIn(el, index = 0, step = 28, max = 420) {
  if (!el) return;
  el.classList.add('fade-in');
  if (!prefersReduced()) el.style.animationDelay = `${Math.min(index * step, max)}ms`;
}
