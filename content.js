/* ── Cache ──────────────────────────────────────────────────────────── */

const CACHE_NS = "luCache";
const CACHE_MAX = 500;

function hashText(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "k" + h.toString(36);
}

function normalizeForCache(s) {
  return s.replace(/\s+/g, " ").toLowerCase().trim();
}

function getCacheKey(text) {
  return hashText(normalizeForCache(text));
}

async function cacheGet(text) {
  try {
    const key = getCacheKey(text);
    const data = await chrome.storage.local.get(CACHE_NS);
    return data[CACHE_NS]?.[key] || null;
  } catch (e) {
    console.error("[LT] cacheGet error:", e);
    return null;
  }
}

async function cacheSet(text, result) {
  try {
    const key = getCacheKey(text);
    const data = await chrome.storage.local.get(CACHE_NS);
    const cache = data[CACHE_NS] || {};
    cache[key] = { ...result, cachedAt: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => (cache[a].cachedAt || 0) - (cache[b].cachedAt || 0));
      for (let i = 0; i < keys.length - CACHE_MAX; i++) delete cache[keys[i]];
    }
    await chrome.storage.local.set({ [CACHE_NS]: cache });
  } catch (e) {
    console.error("[LT] cacheSet error:", e);
  }
}

/* ── Config ─────────────────────────────────────────────────────────── */

const DEFAULT_PROVIDER = { baseUrl: "https://api.mistral.ai/v1", apiKey: "", model: "mistral-small-latest" };
const TEXT_SEL = 'p[componentkey^="feed-commentary"], .feed-shared-inline-show-more-text';
const TEXT_BOX_SEL = '[data-testid="expandable-text-box"]';

/* ── API helpers ──────────────────────────────────────────────────────── */

async function getActiveProvider() {
  const { luProviders, luActiveProvider } = await chrome.storage.local.get(["luProviders", "luActiveProvider"]);
  return luProviders?.find((p) => p.id === luActiveProvider) || DEFAULT_PROVIDER;
}

async function fetchAnalysis(provider, text, showUseful, personality) {
  const response = await chrome.runtime.sendMessage({
    type: "analyzePost", provider, text, showUseful, personality
  });
  if (!response.success) throw new Error(response.error);
  return response.result;
}

/* ── Personality chips ────────────────────────────────────────────── */

const PERSONALITIES = [
  { id: "blunt", label: "Blunt" },
  { id: "sarcastic", label: "Sarcastic" },
  { id: "corporate", label: "Corporate" },
  { id: "genz", label: "Gen Z" },
];

/* ── Rating color ───────────────────────────────────────────────────── */

function ratingColor(score) {
  if (score <= 2) return "#d93025";
  if (score <= 4) return "#e37400";
  if (score <= 6) return "#f9a825";
  if (score <= 8) return "#1b7d3a";
  return "#0a66c2";
}

function updateRatingEl(ratingEl, rating) {
  if (!ratingEl) return;
  const color = ratingColor(rating);
  ratingEl.style.color = color;
  ratingEl.innerHTML = `<span class="lt-rating-dot" style="background:${color}"></span>${rating}/10 substance score`;
}

function populateInsightsList(listEl, insights) {
  if (!listEl) return;
  listEl.innerHTML = "";
  for (const item of insights) {
    const li = document.createElement("li");
    li.textContent = item;
    listEl.appendChild(li);
  }
}

/* ── DOM helpers ────────────────────────────────────────────────────── */

function getPostText(textP) {
  const box = textP.querySelector(TEXT_BOX_SEL);
  if (box) return (box.textContent || box.innerText).trim();
  return (textP.textContent || textP.innerText).trim();
}

function findActionBars() {
  const bars = new Set();
  const selectors = [
    'svg[id="comment-small"], svg[id="repost-small"], svg[id="send-privately-small"]',
    'use[href="#comment-small"], use[href="#repost-small"], use[href="#send-privately-small"]',
  ];
  for (const el of document.querySelectorAll(selectors.join(", "))) {
    const btn = el.closest("button");
    if (!btn) continue;
    const bar = btn.closest('.feed-shared-social-action-bar') || btn.parentElement;
    if (bar) bars.add(bar);
  }
  return [...bars];
}

function findPostCard(bar) {
  let el = bar.parentElement;
  while (el && el !== document.body) {
    if (el.querySelector(TEXT_SEL)) return el;
    el = el.parentElement;
  }
  return null;
}

/* ── Scroll anchoring ───────────────────────────────────────────────── */

function anchorScroll(btn) {
  const rect = btn.getBoundingClientRect();
  const y = rect.top + window.scrollY;
  return () => {
    const after = btn.getBoundingClientRect();
    window.scrollBy(0, after.top + window.scrollY - y);
  };
}

/* ── SVG icon ───────────────────────────────────────────────────────── */

const ICON_SVG = `<svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 0L9.4 6.6L16 8L9.4 9.4L8 16L6.6 9.4L0 8L6.6 6.6Z" fill="currentColor"/></svg>`;

/* ── Animated dots ──────────────────────────────────────────────────── */

const dotsTimers = new Map();

function startDots(btn) {
  stopDots(btn);
  const span = btn.querySelector("span");
  if (!span) return;
  let count = 0;
  let delay = 600;
  let elapsed = 0;
  const step = () => {
    count = (count % 3) + 1;
    span.textContent = ".".repeat(count);
    elapsed += delay;
    if (elapsed < 4000) delay = Math.max(180, delay - 40);
    else if (elapsed < 8000) delay = Math.min(500, delay + 30);
    else delay = Math.max(180, delay - 40);
    const id = setTimeout(step, delay);
    dotsTimers.set(btn, id);
  };
  step();
}

function stopDots(btn) {
  const id = dotsTimers.get(btn);
  if (id) {
    clearTimeout(id);
    dotsTimers.delete(btn);
  }
}

function setButtonLoading(btn) {
  btn.innerHTML = `${ICON_SVG}<span></span>`;
  btn.classList.add("loading");
  btn.classList.remove("done", "pending");
  startDots(btn);
}

function setButtonComplete(btn, text = "Done", className = "done") {
  stopDots(btn);
  btn.innerHTML = `${ICON_SVG}<span>${text}</span>`;
  btn.classList.remove("loading", "pending");
  if (className) btn.classList.add(className);
}

/* ── Render result ──────────────────────────────────────────────────── */

function renderResult(post, textP, result, showUseful, personality) {
  const {
    translated_post: translated,
    substance_rating: rating,
    useful_things: insights,
  } = result;
  const existing = post.querySelector(".lt-result-block");
  if (existing) existing.remove();
  textP.style.display = "none";

  const block = document.createElement("div");
  block.className = "lt-result-block";
  block.dataset.luPersonality = personality || "blunt";

  // Rating pill
  const ratingEl = document.createElement("div");
  ratingEl.className = "lt-rating";
  updateRatingEl(ratingEl, rating);
  block.appendChild(ratingEl);

  // Translated post
  const postEl = document.createElement("div");
  postEl.className = "lt-translated-post";
  postEl.textContent = translated;
  block.appendChild(postEl);

  // Personality chips
  const chipsEl = document.createElement("div");
  chipsEl.className = "lt-personality-chips";
  for (const p of PERSONALITIES) {
    const chip = document.createElement("button");
    chip.className = "lt-personality-chip" + (p.id === personality ? " active" : "");
    chip.dataset.personality = p.id;
    chip.textContent = p.label;
    chip.addEventListener("click", () => handlePersonalitySwitch(block, post, textP, p.id));
    chipsEl.appendChild(chip);
  }
  block.appendChild(chipsEl);

  // Useful takeaways (if enabled in settings)
  if (showUseful && insights && insights.length > 0) {
    const insightsEl = document.createElement("div");
    insightsEl.className = "lt-insights";
    const insightsTitle = document.createElement("div");
    insightsTitle.className = "lt-insights-title";
    insightsTitle.textContent = "Useful Takeaways";
    insightsEl.appendChild(insightsTitle);
    const insightsList = document.createElement("ul");
    insightsList.className = "lt-insights-list";
    populateInsightsList(insightsList, insights);
    insightsEl.appendChild(insightsList);
    block.appendChild(insightsEl);
  }

  // Show source toggle
  const toggle = document.createElement("button");
  toggle.className = "lt-toggle";
  toggle.textContent = "Show source";
  let origVisible = false;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const fix = anchorScroll(toggle);
    origVisible = !origVisible;
    textP.style.display = origVisible ? "" : "none";
    toggle.textContent = origVisible ? "Hide source" : "Show source";
    requestAnimationFrame(fix);
  });
  block.appendChild(toggle);

  textP.parentElement.insertBefore(block, textP.nextSibling);
}

/* ── Personality switch ────────────────────────────────────────────── */

async function handlePersonalitySwitch(block, post, textP, newPersonality) {
  if (block.dataset.luPersonality === newPersonality) return;

  // Update active chip
  const chips = block.querySelectorAll(".lt-personality-chip");
  for (const chip of chips) {
    chip.classList.toggle("active", chip.dataset.personality === newPersonality);
    chip.disabled = true;
  }
  block.dataset.luPersonality = newPersonality;

  // Show loading on translated post
  const postEl = block.querySelector(".lt-translated-post");
  if (postEl) {
    postEl.dataset.ltOrigText = postEl.textContent;
    postEl.textContent = "";
    postEl.classList.add("lt-loading-text");
  }

  // Hide insights while loading
  const insightsEl = block.querySelector(".lt-insights");
  if (insightsEl) insightsEl.style.display = "none";

  try {
    const text = getPostText(textP);
    const { luShowUseful } = await chrome.storage.local.get("luShowUseful");
    const showUseful = luShowUseful !== false;
    const provider = await getActiveProvider();

    const { translated_post, substance_rating, useful_things } = await fetchAnalysis(provider, text, showUseful, newPersonality);

    // Update rating
    const ratingEl = block.querySelector(".lt-rating");
    updateRatingEl(ratingEl, substance_rating);

    // Update translated post
    if (postEl) {
      postEl.classList.remove("lt-loading-text");
      postEl.textContent = translated_post;
    }

    // Update insights
    if (showUseful && insightsEl && useful_things && useful_things.length > 0) {
      const list = insightsEl.querySelector(".lt-insights-list");
      populateInsightsList(list, useful_things);
      insightsEl.style.display = "";
    } else if (insightsEl) {
      insightsEl.style.display = "none";
    }

    chrome.runtime.sendMessage({ type: "incrementCounter", postHash: getCacheKey(text) }).catch(() => {});
  } catch (e) {
    console.error("[LT] Personality switch error:", e.message);
    if (postEl) {
      postEl.classList.remove("lt-loading-text");
      postEl.textContent = postEl.dataset.ltOrigText || "Error switching personality.";
    }
  } finally {
    for (const chip of chips) chip.disabled = false;
  }
}

/* ── Inline API key prompt ──────────────────────────────────────────── */

function showInlinePrompt(post, actionBar, btn) {
  const existing = post.querySelector(".lt-inline-prompt");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.className = "lt-inline-prompt";
  wrap.innerHTML = `
    <span class="lt-inline-label">API key required:</span>
    <input type="password" class="lt-inline-input" placeholder="Enter API key" autocomplete="off">
    <button class="lt-inline-save">Go</button>
  `;
  const input = wrap.querySelector("input");
  const saveBtn = wrap.querySelector("button");

  saveBtn.addEventListener("click", async () => {
    const key = input.value.trim();
    if (!key) return;
    const { luProviders, luActiveProvider } = await chrome.storage.local.get(["luProviders", "luActiveProvider"]);
    if (luProviders) {
      const p = luProviders.find((x) => x.id === luActiveProvider);
      if (p) p.apiKey = key;
      await chrome.storage.local.set({ luProviders });
    }
    wrap.remove();
    btn.click();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
  });

  actionBar.parentElement?.insertBefore(wrap, actionBar.nextSibling);
  input.focus();
}

/* ── Main handler ───────────────────────────────────────────────────── */

async function handleUnfilter(btn, post, actionBar, text) {
  const fix = anchorScroll(btn);

  const provider = await getActiveProvider();

  if (!provider.apiKey) {
    stopDots(btn);
    showInlinePrompt(post, actionBar, btn);
    btn.classList.remove("loading");
    btn.innerHTML = `${ICON_SVG}<span>Unfilter</span>`;
    return;
  }

  try {
    const { luShowUseful, luPersonality } = await chrome.storage.local.get(["luShowUseful", "luPersonality"]);
    const showUseful = luShowUseful !== false;
    const personality = luPersonality || "blunt";
    let result = await cacheGet(text);
    if (!result) {
      result = await fetchAnalysis(provider, text, showUseful, personality);
      await cacheSet(text, result);
    }
    const textP = post.querySelector(TEXT_SEL);
    if (textP) renderResult(post, textP, result, showUseful, personality);
    setButtonComplete(btn);
    requestAnimationFrame(fix);
    chrome.runtime.sendMessage({ type: "incrementCounter", postHash: getCacheKey(text) }).catch(() => {});
  } catch (e) {
    console.error("[LT] handleUnfilter ERROR:", e.message);
    stopDots(btn);
    btn.innerHTML = `${ICON_SVG}<span>Error</span>`;
    btn.classList.remove("loading");
    const errEl = document.createElement("div");
    errEl.className = "lt-error";
    errEl.textContent = e.message;
    post.appendChild(errEl);
    setTimeout(() => {
      btn.innerHTML = `${ICON_SVG}<span>Unfilter</span>`;
      setTimeout(() => errEl.remove(), 8000);
    }, 5000);
  }
}

/* ── Button injection ───────────────────────────────────────────────── */

function injectButton(actionBar, post) {
  if (actionBar.querySelector(".lt-unfilter-btn")) return;
  if (post.querySelector(".lt-result-block")) return;

  const textP = post.querySelector(TEXT_SEL);
  if (!textP) return;
  if (!textP.innerText?.trim()) return;

  const btn = document.createElement("button");
  btn.className = "lt-unfilter-btn";
  btn.innerHTML = `${ICON_SVG}<span>Unfilter</span>`;

  btn.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      const text = getPostText(textP);
      if (!text) return;
      setButtonLoading(btn);
      handleUnfilter(btn, post, actionBar, text);
    },
    true,
  );

  btn.addEventListener("mousedown", (e) => e.stopPropagation(), true);
  btn.addEventListener("pointerdown", (e) => e.stopPropagation(), true);

  actionBar.appendChild(btn);
}

/* ── Feed scanner ───────────────────────────────────────────────────── */

function scanFeed() {
  // Bottom-up scan: find action bars by SVG icons, then walk up to post container
  for (const bar of findActionBars()) {
    const post = findPostCard(bar);
    if (post) injectButton(bar, post);
  }
}

/* ── Dark mode detection ────────────────────────────────────────────── */

function updateTheme() {
  const isDark =
    document.body.classList.contains("dark-mode") ||
    document.body.classList.contains("theme--dark") ||
    document.body.getAttribute("data-theme") === "dark" ||
    document.body.getAttribute("data-color-scheme") === "dark" ||
    document.documentElement.classList.contains("theme--dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.documentElement.getAttribute("data-color-scheme") === "dark";
  document.documentElement.setAttribute("data-lt-theme", isDark ? "dark" : "light");
}

function startThemeObserver() {
  updateTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateTheme);

  const observer = new MutationObserver(updateTheme);
  const config = { attributes: true, attributeFilter: ["class", "data-theme", "data-color-scheme"] };

  observer.observe(document.body, config);
  observer.observe(document.documentElement, config);
}

/* ── Auto-analyze (dwell 5s) ─────────────────────────────────────────── */

const AUTO_TRANSLATE_MAX = 3;
let autoTranslateCount = 0;
const dwellTimers = new Map();
const dwellData = new Map();

function canAutoTranslate(btn, post) {
  if (post.querySelector(".lt-result-block")) return false;
  if (btn.classList.contains("loading") || btn.classList.contains("done")) return false;
  if (autoTranslateCount >= AUTO_TRANSLATE_MAX) return false;
  return true;
}

const COUNTDOWN_RING_CIRCUMFERENCE = 2 * Math.PI * 9;

function createCountdownHTML() {
  return `
    <div class="lt-countdown">
      <svg class="lt-countdown-ring" viewBox="0 0 24 24">
        <circle class="lt-countdown-ring-bg" cx="12" cy="12" r="9"/>
        <circle class="lt-countdown-ring-progress" cx="12" cy="12" r="9"
          stroke-dasharray="${COUNTDOWN_RING_CIRCUMFERENCE}"
          stroke-dashoffset="${COUNTDOWN_RING_CIRCUMFERENCE}"/>
      </svg>
      <span class="lt-countdown-num"></span>
    </div>`;
}

function startCountdown(btn, seconds) {
  const data = { remaining: seconds, interval: null };
  dwellData.set(btn, data);

  const numEl = btn.querySelector(".lt-countdown-num");
  const progressEl = btn.querySelector(".lt-countdown-ring-progress");
  if (!numEl || !progressEl) return;

  numEl.textContent = seconds;

  requestAnimationFrame(() => {
    progressEl.style.transition = `stroke-dashoffset ${seconds}s linear`;
    progressEl.style.strokeDashoffset = "0";
  });

  data.interval = setInterval(() => {
    data.remaining--;
    if (numEl) numEl.textContent = Math.max(0, data.remaining);
    if (data.remaining <= 0) {
      clearInterval(data.interval);
      data.interval = null;
    }
  }, 1000);
}

function stopCountdown(btn) {
  const data = dwellData.get(btn);
  if (data) {
    if (data.interval) clearInterval(data.interval);
    dwellData.delete(btn);
  }
}

function removePending(btn) {
  stopCountdown(btn);
  btn.classList.remove("pending");
  const cd = btn.querySelector(".lt-countdown");
  if (cd) cd.remove();
}

async function startDwell(btn, post, actionBar, textP) {
  if (dwellTimers.has(btn)) return;

  const { luDwellTime } = await chrome.storage.local.get("luDwellTime");
  const seconds = luDwellTime || 5;

  btn.innerHTML = `${createCountdownHTML()}<span></span>`;
  btn.classList.add("pending");
  requestAnimationFrame(() => startCountdown(btn, seconds));

  const timer = setTimeout(() => {
    dwellTimers.delete(btn);
    removePending(btn);
    if (!canAutoTranslate(btn, post)) return;
    const text = getPostText(textP);
    if (!text) return;
    autoTranslateCount++;
    setButtonLoading(btn);
    handleUnfilter(btn, post, actionBar, text).finally(() => {
      autoTranslateCount--;
    });
  }, seconds * 1000);
  dwellTimers.set(btn, timer);
}

function cancelDwell(btn) {
  const timer = dwellTimers.get(btn);
  if (timer) {
    clearTimeout(timer);
    dwellTimers.delete(btn);
  }
  removePending(btn);
}

let autoTranslateEnabled = false;
let autoTranslateObserver = null;

async function loadAutoTranslateSetting() {
  const { luAutoTranslate } = await chrome.storage.local.get("luAutoTranslate");
  autoTranslateEnabled = luAutoTranslate === true;
}

function scanForAutoTranslate() {
  if (!autoTranslateEnabled || !autoTranslateObserver) return;
  const allPosts = new Set();

  for (const bar of findActionBars()) {
    const post = findPostCard(bar);
    if (post) allPosts.add(post);
  }

  for (const post of allPosts) {
    if (!post.hasAttribute("data-lt-auto-observed")) {
      post.setAttribute("data-lt-auto-observed", "true");
      autoTranslateObserver.observe(post);
    }
  }
}

function startAutoTranslateObserver() {
  autoTranslateObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const post = entry.target;
        const btn = post.querySelector(".lt-unfilter-btn");
        if (!btn) continue;
        const textP = post.querySelector(TEXT_SEL);
        if (!textP) continue;

        if (entry.isIntersecting) {
          if (autoTranslateEnabled && canAutoTranslate(btn, post)) {
            startDwell(btn, post, btn.parentElement, textP);
          }
        } else {
          cancelDwell(btn);
        }
      }
    },
    { threshold: 0.3 }
  );
  scanForAutoTranslate();
}

/* ── Init ───────────────────────────────────────────────────────────── */

function init() {
  scanFeed();
  startThemeObserver();
  loadAutoAnalyzeSetting().then(startAutoTranslateObserver);

  let debounceTimer;
  const scanAll = () => {
    scanFeed();
    scanForAutoTranslate();
  };
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanAll, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(scanAll, 3000);

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.luAutoTranslate) {
      autoTranslateEnabled = changes.luAutoTranslate.newValue === true;
    }
  });
}

/* ── Retry progress from background ─────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "retryProgress") return;
  const btn = document.querySelector(".lt-unfilter-btn.loading");
  if (btn) {
    const span = btn.querySelector("span");
    if (span) span.textContent = `${msg.label} ${msg.attempt}/3`;
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
