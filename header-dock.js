(() => {
  const dock = document.querySelector('.icon-dock');
  if (!dock) return;

  const buttons = Array.from(dock.querySelectorAll('.dock-btn'));
  if (buttons.length === 0) return;

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const MAX_RADIUS = 136; // px distance where proximity scaling begins
  const NEAR_ENTER = 86;  // px distance to trigger bespoke SVG micro-animation
  const NEAR_LEAVE = 104; // hysteresis threshold to prevent boundary flicker

  let rafId = 0;
  let lastPointer = null;
  let isEngaged = false;

  function resetAll() {
    if (!isEngaged) return;
    isEngaged = false;
    for (const btn of buttons) {
      btn.style.setProperty('--prox', '0');
      btn.style.setProperty('--mag-x', '0px');
      btn.style.setProperty('--mag-y', '0px');
      delete btn.dataset.near;
    }
  }

  function updateProximity() {
    rafId = 0;
    if (!lastPointer || !finePointer.matches || reducedMotion.matches) {
      resetAll();
      return;
    }

    const { x, y } = lastPointer;
    const dockRect = dock.getBoundingClientRect();

    // Fast bounding-box bailout when cursor is far away from the header dock
    const outX = x < dockRect.left - MAX_RADIUS || x > dockRect.right + MAX_RADIUS;
    const outY = y < dockRect.top - MAX_RADIUS || y > dockRect.bottom + MAX_RADIUS;
    if (outX || outY) {
      resetAll();
      return;
    }

    isEngaged = true;

    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      if (dist < MAX_RADIUS) {
        // Smooth cosine falloff: 1 at center -> 0 at MAX_RADIUS
        const t = 1 - dist / MAX_RADIUS;
        const weight = 0.5 * (1 - Math.cos(Math.PI * t));
        const magX = (dx / MAX_RADIUS) * 5 * weight;
        const magY = (dy / MAX_RADIUS) * 4 * weight;

        btn.style.setProperty('--prox', weight.toFixed(3));
        btn.style.setProperty('--mag-x', `${magX.toFixed(2)}px`);
        btn.style.setProperty('--mag-y', `${magY.toFixed(2)}px`);
      } else {
        btn.style.setProperty('--prox', '0');
        btn.style.setProperty('--mag-x', '0px');
        btn.style.setProperty('--mag-y', '0px');
      }

      if (dist <= NEAR_ENTER) {
        btn.dataset.near = 'true';
      } else if (dist >= NEAR_LEAVE) {
        delete btn.dataset.near;
      }
    }
  }

  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse' || !finePointer.matches || reducedMotion.matches) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateProximity);
      }
    },
    { passive: true }
  );

  document.addEventListener('pointerleave', () => {
    lastPointer = null;
    resetAll();
  });

  window.addEventListener('blur', () => {
    lastPointer = null;
    resetAll();
  });

  reducedMotion.addEventListener('change', (e) => {
    if (e.matches) resetAll();
  });
})();
