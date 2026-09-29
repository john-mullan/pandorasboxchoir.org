/* H9 artwork: the approved Vivid fill and scroll descent.
   Derived from H9's tested motion engine; review controls are not shipped. */
(() => {
  const HTML = document.documentElement;
  const main = document.getElementById('top');
  const skipLink = document.querySelector('.skip-link');
  if (skipLink && main) {
    skipLink.addEventListener('click', () => main.focus({ preventScroll: true }));
  }

  const h1 = document.querySelector('.wordmark h1');
  const stage = document.querySelector('.wordmark-stage');
  const fastWindow = document.querySelector('.wordmark-window');
  const fastPaint = document.querySelector('.wordmark-paint');
  const fastCanvas = document.querySelector('.wordmark-firefox');
  const fastCanvasContext = fastCanvas && fastCanvas.getContext
    ? fastCanvas.getContext('2d', { alpha: true, desynchronized: true })
    : null;
  const hero = document.querySelector('.hero');
  if (!h1 || !hero) return;

  // These agree with the built H9 attributes and CSS defaults.
  HTML.dataset.wmsrc = 'canvas';
  HTML.dataset.navtop = 'painted';
  HTML.dataset.sep = 'dot';
  const REST = { x: 50, y: 82 };

  /* ---- Option 1: fixed mask, transformed Vivid strip -----------------
     The full source is 1746x4000. At the wordmark's invariant aspect ratio
     cover exposes 479.787 source rows; y=82% starts at 2886.574 and the foot
     starts at 3520.213. The baked strip is rows 2886..4000, so it contains
     every source pixel the descent can reveal while decoding 71% less than
     the old full canvas. Geometry is refreshed only after layout changes.
     During scroll the fast path writes transform and nothing else. */
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const held = () => still.matches;
  const MASK_OK = !!(window.CSS && (
    CSS.supports('mask-image', 'linear-gradient(#000, #000)') ||
    CSS.supports('-webkit-mask-image', 'linear-gradient(#000, #000)')
  ));
  const FIREFOX_CANVAS = !!(fastCanvasContext && window.CSS &&
    CSS.supports('(-moz-appearance: none)'));
  const FAST = { canvasW: 1746, canvasH: 4000, cropTop: 2886, cropH: 1114 };
  let anim = null;
  let nativeDriving = false;
  let ticking = false;
  let heroSpan = 1;
  let fastFrom = 0;
  let fastTo = 0;
  let fastReady = false;
  let fastFailed = false;
  let fastReadyKey = '';
  let fastPendingKey = '';
  let fastStripImage = null;
  let fastMaskImage = null;
  let fastCanvasScale = 1;
  const fastImages = [];
  const decodeCache = new Map();
  /* H9: CSS picks Firefox's canvas surface from the same sniff; if the 2D
     context is refused (a canvas-blocking extension) that surface can never
     paint, so give the name to the plain H1 instead of leaving it blank. */
  if (!FIREFOX_CANVAS && window.CSS && CSS.supports('(-moz-appearance: none)')) fastFailed = true;

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
  function transformAt(y) { return 'translate3d(0,' + y.toFixed(3) + 'px,0)'; }
  function scrollTop() { return (document.scrollingElement || HTML).scrollTop || 0; }

  function cancelMotion() {
    if (anim) { anim.cancel(); anim = null; }
    nativeDriving = false;
    delete HTML.dataset.wmtravel;
  }

  function cssUrl(value) {
    const match = value && value.match(/url\((['"]?)(.*?)\1\)/);
    return match ? match[2] : '';
  }

  function decodeImage(url, cors) {
    const cacheKey = (cors ? 'cors|' : '') + url;
    if (decodeCache.has(cacheKey)) return decodeCache.get(cacheKey);
    const promise = new Promise((resolve, reject) => {
      if (!url) return reject(new Error('missing image URL'));
      const image = new Image();
      if (cors) image.crossOrigin = 'anonymous';
      fastImages.push(image); // keep decoded resources alive for the session
      let settled = false;
      const done = (fn, value) => () => { if (!settled) { settled = true; fn(value); } };
      image.onload = done(resolve, image);
      image.onerror = done(reject, new Error('image decode failed'));
      image.src = url;
      if (image.decode) image.decode().then(done(resolve, image)).catch(() => {});
    });
    decodeCache.set(cacheKey, promise);
    return promise;
  }

  function prepareFastAssets() {
    if (fastFailed || !MASK_OK || !fastPaint || !fastWindow) return;
    /* Computed styles resolve the responsive strip variable and, in the
       standalone, resolve both values to the embedded data URLs. */
    const stripUrl = cssUrl(getComputedStyle(fastPaint).backgroundImage);
    const windowStyle = getComputedStyle(fastWindow);
    const maskUrl = cssUrl(windowStyle.webkitMaskImage || windowStyle.maskImage);
    const assetKey = stripUrl + '|' + maskUrl;
    if (fastReadyKey === assetKey) { fastReady = true; return; }
    fastReady = false;
    if (fastPendingKey === assetKey) return;
    fastPendingKey = assetKey;
    const fontReady = document.fonts
      ? document.fonts.load('700 1em "ITC Korinna"')
      : Promise.resolve();
    /* CSS fetches mask-image in CORS mode, so the readiness check must too:
       H7's plain Image succeeded from file:// where the CSS mask was blocked,
       and the page then hid the H1 behind a mask that never arrived. Same
       mode also means one request for the mask over http, not two. Firefox's
       canvas path draws the mask itself and needs no CORS, so it is exempt. */
    Promise.all([fontReady, decodeImage(stripUrl), decodeImage(maskUrl, !FIREFOX_CANVAS)])
      .then(([, stripImage, maskImage]) => {
        if (fastPendingKey === assetKey) {
          fastStripImage = stripImage;
          fastMaskImage = maskImage;
          fastReadyKey = assetKey;
          fastPendingKey = '';
          fastReady = true;
        }
        refreshMotion();
      })
      .catch(() => {
        if (fastPendingKey === assetKey) {
          fastFailed = true;
          fastPendingKey = '';
          refreshMotion();
        }
      });
  }

  function cacheGeometry() {
    heroSpan = Math.max(hero ? hero.offsetHeight : 0, 1);
    if (!stage) return false;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const scale = rect.width / FAST.canvasW;
    const visibleSourceH = rect.height / scale;
    const maxSourceOffset = Math.max(FAST.cropH - visibleSourceH, 0);
    const restSourceTop = (FAST.canvasH - visibleSourceH) * .82;
    const restOffset = clamp(restSourceTop - FAST.cropTop, 0, maxSourceOffset);
    fastFrom = -restOffset * scale;
    fastTo = -maxSourceOffset * scale;
    if (FIREFOX_CANVAS) {
      /* 1.5x is visibly crisp at the largest wordmark but keeps the canvas
         under 2.7 MiB on Retina-class displays; 2x nearly doubles every
         per-frame composite for no meaningful edge gain at this type size. */
      const density = Math.min(Math.max(devicePixelRatio || 1, 1), 1.5, 2057 / rect.width);
      const width = Math.max(1, Math.round(rect.width * density));
      const height = Math.max(1, Math.round(rect.height * density));
      if (fastCanvas.width !== width || fastCanvas.height !== height) {
        fastCanvas.width = width;
        fastCanvas.height = height;
      }
      fastCanvasScale = width / rect.width;
    }
    return true;
  }

  function timelineFor(element, keyframes) {
    if (typeof ScrollTimeline !== 'function' || !element || !element.animate) return false;
    try {
      const scroller = document.scrollingElement || HTML;
      const total = Math.max(scroller.scrollHeight - innerHeight, 1);
      const edge = clamp(heroSpan / total, .01, 1);
      /* No duration: a millisecond duration against a progress timeline can
         leave the effect inactive in Chromium. Equal transform function lists
         keep the fast animation interpolation on the compositor. */
      anim = element.animate([
        Object.assign({ offset: 0 }, keyframes[0]),
        Object.assign({ offset: edge }, keyframes[1]),
        Object.assign({ offset: 1 }, keyframes[1]),
      ], {
        fill: 'both',
        easing: 'linear',
        timeline: new ScrollTimeline({ source: scroller }),
      });
      nativeDriving = true;
      return true;
    } catch (error) {
      anim = null;
      nativeDriving = false;
      return false;
    }
  }

  function renderCanvasFrame(y) {
    if (!fastCanvasContext || !fastStripImage || !fastMaskImage) return;
    const width = fastCanvas.width;
    const height = fastCanvas.height;
    const paintScale = width / FAST.canvasW;
    fastCanvasContext.clearRect(0, 0, width, height);
    fastCanvasContext.globalCompositeOperation = 'source-over';
    fastCanvasContext.drawImage(
      fastStripImage, 0, y * fastCanvasScale,
      width, FAST.cropH * paintScale
    );
    fastCanvasContext.globalCompositeOperation = 'destination-in';
    fastCanvasContext.drawImage(fastMaskImage, 0, 0, width, height);
    fastCanvasContext.globalCompositeOperation = 'source-over';
  }

  function renderFastAt(y) {
    if (FIREFOX_CANVAS) renderCanvasFrame(y);
    else fastPaint.style.transform = transformAt(y);
  }

  function renderFastFrame() {
    const p = clamp(scrollTop() / heroSpan, 0, 1);
    renderFastAt(fastFrom + (fastTo - fastFrom) * p);
  }

  function renderLegacyFrame() {
    const p = clamp(scrollTop() / heroSpan, 0, 1);
    h1.style.backgroundPosition = REST.x + '% ' +
      (REST.y + (100 - REST.y) * p).toFixed(2) + '%';
  }

  function runFast() {
    if (!cacheGeometry()) return;
    h1.style.backgroundPosition = '';
    h1.style.backgroundSize = '';
    const moving = !held();
    if (moving) renderFastFrame();
    else renderFastAt(fastFrom);
    HTML.dataset.wmfast = 'active';
    if (!moving) return;
    HTML.dataset.wmtravel = 'on';
    if (!FIREFOX_CANVAS && !timelineFor(fastPaint, [
      { transform: transformAt(fastFrom) },
      { transform: transformAt(fastTo) },
    ])) renderFastFrame();
  }

  function runLegacy() {
    HTML.removeAttribute('data-wmfast');
    h1.style.backgroundSize = '';
    heroSpan = Math.max(hero ? hero.offsetHeight : 0, 1);
    if (held()) {
      h1.style.backgroundPosition = '';
      return;
    }
    const from = REST.x + '% ' + REST.y + '%';
    const to = REST.x + '% 100%';
    if (!timelineFor(h1, [
      { backgroundPosition: from },
      { backgroundPosition: to },
    ])) renderLegacyFrame();
  }

  function refreshMotion() {
    if (!h1 || !hero) return;
    cancelMotion();
    if (MASK_OK && !fastFailed && fastPaint && fastWindow) {
      HTML.dataset.wmfast = 'pending';
      prepareFastAssets();
      if (fastReady) runFast();
      return;
    }
    runLegacy();
  }
  still.addEventListener('change', refreshMotion);
  const stripChoice = matchMedia('(min-width: 1200px), (min-width: 600px) and (min-resolution: 1.5dppx)');
  if (stripChoice.addEventListener) stripChoice.addEventListener('change', refreshMotion);
  else stripChoice.addListener(refreshMotion);

  let resizeTimer = 0;
  function scheduleRefresh() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refreshMotion, 120);
  }
  addEventListener('resize', scheduleRefresh);
  addEventListener('load', refreshMotion, { once: true });
  if (document.fonts) document.fonts.ready.then(refreshMotion);
  if (typeof ResizeObserver === 'function' && stage) {
    const observer = new ResizeObserver(scheduleRefresh);
    observer.observe(stage);
    observer.observe(hero);
    // Changes below the fold affect the progress range of ScrollTimeline.
    observer.observe(HTML);
  }
  addEventListener('scroll', () => {
    if (nativeDriving || held()) return;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (fastReady && HTML.dataset.wmfast === 'active') renderFastFrame();
        else if (!HTML.hasAttribute('data-wmfast')) renderLegacyFrame();
      });
    }
  }, { passive: true });

  refreshMotion();
})();
