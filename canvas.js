(() => {
  const indexList = document.getElementById('index-list');
  const floatingCard = document.getElementById('floating-card');
  const floatingCardBody = document.getElementById('floating-card-body');
  const previewStage = floatingCard?.parentElement;
  const tradingToggle = document.getElementById('index-trading');
  const tradingPanel = document.getElementById('trading-sublist');

  if (!indexList) return;

  const desktopHoverQuery = window.matchMedia(
    '(hover: hover) and (pointer: fine) and (min-width: 768px)'
  );
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let activeItem = null;
  let currentPreviewKey = null;
  let lastPointerItem = null;
  let keyboardActive = false;
  let parallaxRaf = 0;
  let pendingParallax = null;
  let hidePanelTimer = 0;

  const getInteractiveItems = () =>
    Array.from(indexList.querySelectorAll('.index-row, .index-sublink'));

  /* --------------------------------------------------------------------------
     Expand / collapse 01 Trading disclosure
     -------------------------------------------------------------------------- */
  function setTradingExpanded(expanded) {
    if (!tradingToggle || !tradingPanel) return;

    window.clearTimeout(hidePanelTimer);
    tradingToggle.setAttribute('aria-expanded', String(expanded));

    if (expanded) {
      tradingPanel.hidden = false;
      // Ensure starting state is committed before opening transition.
      void tradingPanel.offsetHeight;
      tradingPanel.dataset.open = 'true';
    } else {
      tradingPanel.dataset.open = 'false';

      // Per motion guidance: if reduced motion prevents any transition from running,
      // finalize immediately rather than waiting on transitionend.
      const animations = tradingPanel.getAnimations ? tradingPanel.getAnimations() : [];
      if (reducedMotionQuery.matches || animations.length === 0) {
        tradingPanel.hidden = true;
      } else {
        const onEnd = (event) => {
          if (event.target !== tradingPanel) return;
          tradingPanel.removeEventListener('transitionend', onEnd);
          if (tradingPanel.dataset.open !== 'true') {
            tradingPanel.hidden = true;
          }
        };
        tradingPanel.addEventListener('transitionend', onEnd);
        hidePanelTimer = window.setTimeout(() => {
          if (tradingPanel.dataset.open !== 'true') {
            tradingPanel.hidden = true;
          }
        }, 320);
      }
    }

    if (activeItem && desktopHoverQuery.matches) {
      window.requestAnimationFrame(() => positionCard(activeItem, false));
    }
  }

  if (tradingToggle && tradingPanel) {
    tradingToggle.addEventListener('click', () => {
      const isExpanded = tradingToggle.getAttribute('aria-expanded') === 'true';
      setTradingExpanded(!isExpanded);
    });
  }

  /* --------------------------------------------------------------------------
     Active hairline indicator & floating preview card
     -------------------------------------------------------------------------- */
  function renderPreviewContent(key) {
    if (!floatingCardBody || !key || key === currentPreviewKey) return;
    const tpl = document.getElementById(`tpl-preview-${key}`);
    if (!tpl) return;

    currentPreviewKey = key;
    floatingCardBody.replaceChildren(tpl.content.cloneNode(true));

    if (!reducedMotionQuery.matches) {
      floatingCardBody.classList.remove('is-swapping');
      void floatingCardBody.offsetWidth;
      floatingCardBody.classList.add('is-swapping');
    }
  }

  function positionCard(item, snap) {
    if (!floatingCard || !previewStage || !item || !desktopHoverQuery.matches) return;

    const stageRect = previewStage.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const listRect = indexList.getBoundingClientRect();
    const cardWidth = floatingCard.offsetWidth || 264;
    const cardHeight = floatingCard.offsetHeight || 148;

    const horizontalGap = Math.max(20, Math.min(32, stageRect.width * 0.055));
    const rightPadding = 20;

    // Anchor horizontally right of the visible index column (or active item), clamped inside pane.
    const anchorRight = Math.max(listRect.right, itemRect.right) - stageRect.left;
    const maxCardX = Math.max(12, stageRect.width - cardWidth - rightPadding);
    const cardX = Math.min(anchorRight + horizontalGap, maxCardX);

    // Center vertically on the active item, clamped within viewport breathing room.
    const itemCenterY = itemRect.top - stageRect.top + itemRect.height / 2;
    const edgeMargin = 24;
    const minCardY = edgeMargin;
    const maxCardY = Math.max(minCardY, stageRect.height - cardHeight - edgeMargin);
    const cardY = Math.max(minCardY, Math.min(itemCenterY - cardHeight / 2, maxCardY));

    // Align the left caret directly to the active item center even when clamped.
    const rawCaretY = itemCenterY - cardY;
    const caretY = Math.max(20, Math.min(rawCaretY, cardHeight - 20));

    if (snap) {
      floatingCard.dataset.snapping = 'true';
    }

    floatingCard.style.setProperty('--card-x', `${Math.round(cardX)}px`);
    floatingCard.style.setProperty('--card-y', `${Math.round(cardY)}px`);
    floatingCard.style.setProperty('--caret-y', `${Math.round(caretY)}px`);

    if (snap) {
      void floatingCard.offsetWidth;
      delete floatingCard.dataset.snapping;
    }
  }

  function setActiveItem(item) {
    if (!item) return;

    const wasVisible = floatingCard?.dataset.visible === 'true';

    for (const el of getInteractiveItems()) {
      if (el === item) {
        el.dataset.active = 'true';
        el.dataset.anchor = 'true';
      } else {
        delete el.dataset.active;
        delete el.dataset.anchor;
      }
    }

    activeItem = item;
    indexList.dataset.hasActive = 'true';

    if (!desktopHoverQuery.matches || !floatingCard) return;

    const previewKey = item.dataset.preview;
    renderPreviewContent(previewKey);
    positionCard(item, !wasVisible);
    floatingCard.dataset.visible = 'true';
  }

  function clearActiveItem() {
    activeItem = null;
    indexList.dataset.hasActive = 'false';

    if (floatingCard) {
      floatingCard.dataset.visible = 'false';
      floatingCard.style.setProperty('--px', '0px');
      floatingCard.style.setProperty('--py', '0px');
    }

    // Keep data-anchor on the last hovered item so the CSS anchor indicator
    // fades out cleanly in place rather than losing its anchor mid-transition.
    for (const el of getInteractiveItems()) {
      delete el.dataset.active;
    }
  }

  /* --------------------------------------------------------------------------
     Subtle cursor-tracking parallax (desktop mouse, non-reduced-motion only)
     -------------------------------------------------------------------------- */
  function scheduleParallax(clientX, clientY) {
    if (
      !floatingCard ||
      !activeItem ||
      !desktopHoverQuery.matches ||
      reducedMotionQuery.matches ||
      floatingCard.dataset.visible !== 'true'
    ) {
      return;
    }

    pendingParallax = { clientX, clientY };
    if (parallaxRaf) return;

    parallaxRaf = window.requestAnimationFrame(() => {
      parallaxRaf = 0;
      if (!pendingParallax || !activeItem) return;

      const rect = activeItem.getBoundingClientRect();
      const relX = ((pendingParallax.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      const relY = ((pendingParallax.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;

      const clampedX = Math.max(-1, Math.min(1, relX));
      const clampedY = Math.max(-1, Math.min(1, relY));

      floatingCard.style.setProperty('--px', `${(clampedX * 5).toFixed(2)}px`);
      floatingCard.style.setProperty('--py', `${(clampedY * 4).toFixed(2)}px`);
      pendingParallax = null;
    });
  }

  /* --------------------------------------------------------------------------
     Pointer & Keyboard Event Wiring
     -------------------------------------------------------------------------- */
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      keyboardActive = true;
    } else if (event.key === 'Escape') {
      const expanded = tradingToggle?.getAttribute('aria-expanded') === 'true';
      if (expanded && tradingPanel && indexList.contains(document.activeElement)) {
        setTradingExpanded(false);
        tradingToggle.focus();
      } else {
        clearActiveItem();
      }
    }
  });

  document.addEventListener(
    'pointerdown',
    () => {
      keyboardActive = false;
    },
    { passive: true }
  );

  indexList.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch' || !desktopHoverQuery.matches) return;
    const item = event.target.closest('.index-row, .index-sublink');
    if (!item || !indexList.contains(item)) return;
    lastPointerItem = item;
    setActiveItem(item);
  });

  indexList.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !desktopHoverQuery.matches) return;
    scheduleParallax(event.clientX, event.clientY);
  });

  indexList.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'touch') return;
    lastPointerItem = null;
    const focused = document.activeElement?.closest?.('.index-row, .index-sublink');
    if (focused && indexList.contains(focused) && focused.matches(':focus-visible')) {
      setActiveItem(focused);
    } else {
      clearActiveItem();
    }
  });

  indexList.addEventListener('focusin', (event) => {
    const item = event.target.closest('.index-row, .index-sublink');
    if (!item || !indexList.contains(item)) return;
    if (keyboardActive || item.matches(':focus-visible')) {
      setActiveItem(item);
    }
  });

  indexList.addEventListener('focusout', (event) => {
    const nextFocus = event.relatedTarget;
    if (nextFocus && indexList.contains(nextFocus)) return;
    if (lastPointerItem && desktopHoverQuery.matches) {
      setActiveItem(lastPointerItem);
    } else {
      clearActiveItem();
    }
  });

  // Keep card aligned if viewport resizes or transitions between desktop & mobile.
  window.addEventListener(
    'resize',
    () => {
      if (!desktopHoverQuery.matches) {
        if (floatingCard) floatingCard.dataset.visible = 'false';
        return;
      }
      if (activeItem) {
        positionCard(activeItem, true);
      }
    },
    { passive: true }
  );

  // Clear preview if media query drops below desktop hover threshold.
  desktopHoverQuery.addEventListener('change', (event) => {
    if (!event.matches) {
      clearActiveItem();
    }
  });
})();
