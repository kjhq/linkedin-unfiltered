/* ── Config ─────────────────────────────────────────────────────────── */

const REGISTRY_URL = "https://models.dev/api.json";
const REGISTRY_CACHE_KEY = "ltModelRegistry";
const REGISTRY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_KEY = "ltProviders";
const ACTIVE_KEY = "ltActiveProvider";
const DEFAULT_PROVIDER_ID = "mistral";

// Fallback API URLs for providers missing from the registry
const API_URLS = {
  mistral: "https://api.mistral.ai/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  groq: "https://api.groq.com/openai/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  togetherai: "https://api.together.xyz/v1",
  xai: "https://api.x.ai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  cohere: "https://api.cohere.com/v2",
  perplexity: "https://api.perplexity.ai",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
  "amazon-bedrock": "",
  azure: "",
  "google-vertex": "",
};

/* ── DOM refs ───────────────────────────────────────────────────────── */

const providerSelect = document.getElementById("providerSelect");
const addProviderBtn = document.getElementById("addProviderBtn");
const addProviderForm = document.getElementById("addProviderForm");
const baseUrlRow = document.getElementById("baseUrlRow");
const baseUrlInput = document.getElementById("baseUrlInput");
const providerHint = document.getElementById("providerHint");
const apiKeyInput = document.getElementById("apiKey");
const toggleKeyBtn = document.getElementById("toggleKey");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const deleteProviderBtn = document.getElementById("deleteProviderBtn");
const statusEl = document.getElementById("status");
const modelSelect = document.getElementById("modelSelect");
const modelHint = document.getElementById("modelHint");

const newProviderName = document.getElementById("newProviderName");
const newProviderUrl = document.getElementById("newProviderUrl");
const newProviderKey = document.getElementById("newProviderKey");
const newProviderModel = document.getElementById("newProviderModel");
const saveNewProviderBtn = document.getElementById("saveNewProviderBtn");
const cancelAddProviderBtn = document.getElementById("cancelAddProviderBtn");

const toggleUseful = document.getElementById("toggleUseful");
const toggleAuto = document.getElementById("toggleAuto");
const dwellRow = document.getElementById("dwellRow");
const dwellInput = document.getElementById("dwellInput");

const personalitySelect = document.getElementById("personalitySelect");
const personalityHint = document.getElementById("personalityHint");

const PERSONALITY_HINTS = {
  blunt: "Honest, no-BS translations",
  sarcastic: "Dry, biting sarcasm",
  corporate: "Maximum jargon amplification",
  genz: "Internet speak and memes",
};

let visible = false;
let providers = [];
let activeId = null;
let registry = null; // { providers: { id -> providerData }, models: [ { id, providerId, ... } ] }

/* ── Helpers ────────────────────────────────────────────────────────── */

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = "status " + type;
}

function genId() {
  return (
    "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  );
}

function isCustomProvider(id) {
  return id && id.startsWith("custom-");
}

/* ── Registry ───────────────────────────────────────────────────────── */

async function fetchRegistry() {
  // Check cache first
  try {
    const cached = await chrome.storage.local.get(REGISTRY_CACHE_KEY);
    const entry = cached[REGISTRY_CACHE_KEY];
    if (entry && Date.now() - entry.fetchedAt < REGISTRY_CACHE_TTL) {
      return entry.data;
    }
  } catch (e) {
    console.error("[LT Popup] Registry cache read error:", e);
  }

  // Fetch fresh
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();

    const processed = processRegistry(raw);

    await chrome.storage.local.set({
      [REGISTRY_CACHE_KEY]: { data: processed, fetchedAt: Date.now() },
    });
    return processed;
  } catch (e) {
    console.error("[LT Popup] Registry fetch error:", e);
    return null;
  }
}

function processRegistry(raw) {
  const providers = {};
  const models = [];

  for (const [providerId, providerData] of Object.entries(raw)) {
    if (!providerData?.models) continue;

    providers[providerId] = {
      id: providerId,
      name: providerData.name || providerId,
      api: providerData.api || "",
      doc: providerData.doc || "",
      npm: providerData.npm || "",
    };

    for (const [modelSlug, modelData] of Object.entries(providerData.models)) {
      models.push({
        id: modelData.id || `${providerId}/${modelSlug}`,
        providerId,
        name: modelData.name || modelSlug,
        family: modelData.family || "",
        structured_output: modelData.structured_output || false,
        tool_call: modelData.tool_call || false,
        reasoning: modelData.reasoning || false,
        attachment: modelData.attachment || false,
        context: modelData.limit?.context || 0,
        output: modelData.limit?.output || 0,
        cost_input: modelData.cost?.input ?? null,
        cost_output: modelData.cost?.output ?? null,
        status: modelData.status || null,
      });
    }
  }

  return { providers, models };
}

/* ── Provider list persistence ──────────────────────────────────────── */

async function loadProviders() {
  const data = await chrome.storage.local.get([STORAGE_KEY, ACTIVE_KEY]);
  providers = data[STORAGE_KEY] || null;
  activeId = data[ACTIVE_KEY] || null;

  if (!providers) {
    providers = [
      { id: DEFAULT_PROVIDER_ID, apiKey: "", model: "mistral-small-latest" },
    ];
    activeId = DEFAULT_PROVIDER_ID;
    await saveProviders();
  }

  if (!activeId || !providers.find((p) => p.id === activeId)) {
    activeId = providers[0]?.id || DEFAULT_PROVIDER_ID;
  }
}

async function saveProviders() {
  await chrome.storage.local.set({
    [STORAGE_KEY]: providers,
    [ACTIVE_KEY]: activeId,
  });
}

/* ── Registry helpers ───────────────────────────────────────────────── */

function getRegistryProvider(id) {
  return registry?.providers?.[id] || null;
}

function getRegistryModels(providerId) {
  if (!registry?.models) return [];
  return registry.models
    .filter((m) => m.providerId === providerId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getUserProvider(id) {
  return providers.find((p) => p.id === id) || null;
}

/* ── Populate provider dropdown ─────────────────────────────────────── */

function renderProviderDropdown() {
  providerSelect.innerHTML = "";

  // Add registry providers
  if (registry?.providers) {
    const sorted = Object.values(registry.providers).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const rp of sorted) {
      const opt = document.createElement("option");
      opt.value = rp.id;
      opt.textContent = rp.id === "mistral" ? `⭐ ${rp.name}` : rp.name;
      providerSelect.appendChild(opt);
    }
  }

  // Add custom providers
  const customs = providers.filter((p) => isCustomProvider(p.id));
  if (customs.length > 0) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "───────────";
    providerSelect.appendChild(sep);

    for (const c of customs) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      providerSelect.appendChild(opt);
    }
  }

  if (providerSelect.querySelector(`option[value="${activeId}"]`)) {
    providerSelect.value = activeId;
  } else {
    providerSelect.value = DEFAULT_PROVIDER_ID;
    activeId = DEFAULT_PROVIDER_ID;
  }
}

/* ── Populate active provider fields ────────────────────────────────── */

function renderActiveProvider() {
  const userP = getUserProvider(activeId);
  const regP = getRegistryProvider(activeId);
  const custom = isCustomProvider(activeId);

  // API key
  apiKeyInput.value = userP?.apiKey || "";

  // Base URL — only show for custom providers
  if (custom) {
    baseUrlInput.value = userP?.baseUrl || "";
    baseUrlRow.classList.add("show");
    deleteProviderBtn.style.display = "block";
  } else if (regP) {
    baseUrlInput.value = regP.api || API_URLS[activeId] || "";
    baseUrlRow.classList.remove("show");
    deleteProviderBtn.style.display = "none";
  } else {
    baseUrlRow.classList.remove("show");
    deleteProviderBtn.style.display = "none";
  }

  // Hint
  if (activeId === "mistral") {
    providerHint.innerHTML =
      '⭐ Recommended — generous free tier, no credit card needed.<br><a href="https://console.mistral.ai" target="_blank">Get your API key at console.mistral.ai</a>';
  } else if (regP?.doc) {
    providerHint.innerHTML = `<a href="${regP.doc}" target="_blank">Get your API key →</a>`;
  } else if (custom) {
    providerHint.innerHTML = "Enter your custom API base URL and key.";
  } else {
    providerHint.innerHTML = "";
  }

  // Clear button
  clearBtn.style.display = userP?.apiKey ? "block" : "none";

  // Models — always from registry if available
  renderModels(userP?.model);
}

/* ── Render models for active provider ──────────────────────────────── */

function renderModels(savedModel) {
  modelSelect.innerHTML = "";

  const regModels = getRegistryModels(activeId);

  if (regModels.length > 0) {
    for (const m of regModels) {
      // Skip deprecated models
      if (m.status === "deprecated") continue;

      const opt = document.createElement("option");
      opt.value = m.id; // Full namespaced ID (e.g., "mistralai/mistral-small-latest")
      let label = m.name;
      const badges = [];
      if (m.structured_output) badges.push("JSON");
      if (m.reasoning) badges.push("Reasoning");
      if (badges.length) label += ` [${badges.join(", ")}]`;
      opt.textContent = label;
      opt.dataset.structuredOutput = m.structured_output;
      modelSelect.appendChild(opt);
    }

    // Select saved or first
    const target = savedModel || regModels[0]?.id;
    if (target && [...modelSelect.options].some((o) => o.value === target)) {
      modelSelect.value = target;
    } else if (modelSelect.options.length > 0) {
      modelSelect.value = modelSelect.options[0].value;
    }

    modelSelect.disabled = false;
    modelHint.textContent = `${modelSelect.options.length} models available`;
  } else {
    // No registry models — try fetching from provider's own /v1/models
    modelSelect.innerHTML = '<option value="">Loading models...</option>';
    modelSelect.disabled = true;

    const userP = getUserProvider(activeId);
    if (userP?.apiKey) {
      loadModelsFromProvider(userP.baseUrl, userP.apiKey, savedModel);
    } else {
      modelSelect.innerHTML =
        '<option value="">Enter your API key to load models</option>';
      modelHint.textContent = "Enter your API key to load models.";
    }
  }
}

/* ── Fallback: fetch models from provider's /v1/models ──────────────── */

async function loadModelsFromProvider(baseUrl, apiKey, savedModel) {
  modelSelect.disabled = true;
  modelSelect.innerHTML = '<option value="">Loading models...</option>';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const seen = new Set();
    const models = (data.data || [])
      .filter(
        (m) =>
          m.id &&
          (!m.capabilities || m.capabilities.completion_chat) &&
          !seen.has(m.id) &&
          seen.add(m.id),
      )
      .map((m) => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      modelHint.textContent = "No models returned by this provider.";
      return;
    }

    modelSelect.innerHTML = "";
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      modelSelect.appendChild(opt);
    }

    const target = savedModel || models[0].id;
    if ([...modelSelect.options].some((o) => o.value === target)) {
      modelSelect.value = target;
    }

    modelSelect.disabled = false;
    modelHint.textContent = `${models.length} models available`;
  } catch (e) {
    console.error("[LT Popup] loadModelsFromProvider error:", e);
    const fallback = savedModel || "";
    modelSelect.innerHTML = fallback
      ? `<option value="${fallback}">${fallback}</option>`
      : '<option value="">Could not fetch models</option>';
    modelSelect.disabled = false;
    modelHint.textContent = "Could not fetch models. Select or type manually.";
  }
}

/* ── Provider events ────────────────────────────────────────────────── */

providerSelect.addEventListener("change", async () => {
  activeId = providerSelect.value;
  await saveProviders();
  renderActiveProvider();
});

addProviderBtn.addEventListener("click", () => {
  addProviderForm.classList.toggle("open");
  if (addProviderForm.classList.contains("open")) newProviderName.focus();
});

cancelAddProviderBtn.addEventListener("click", () => {
  addProviderForm.classList.remove("open");
  newProviderName.value = "";
  newProviderUrl.value = "";
  newProviderKey.value = "";
  newProviderModel.value = "";
});

saveNewProviderBtn.addEventListener("click", async () => {
  const name = newProviderName.value.trim();
  let url = newProviderUrl.value.trim();
  const key = newProviderKey.value.trim();
  const model = newProviderModel.value.trim();

  if (!name || !url) {
    showStatus("Name and Base URL are required", "err");
    return;
  }

  url = url.replace(/\/+$/, "");
  if (!url.endsWith("/v1")) url += "/v1";

  const id = genId();
  providers.push({ id, apiKey: key, model: model || "" });
  activeId = id;

  // Store custom provider info in the registry cache
  if (!registry) registry = { providers: {}, models: [] };
  registry.providers[id] = { id, name, api: url, doc: "", npm: "" };

  await saveProviders();
  addProviderForm.classList.remove("open");
  newProviderName.value = "";
  newProviderUrl.value = "";
  newProviderKey.value = "";
  newProviderModel.value = "";

  renderProviderDropdown();
  renderActiveProvider();
  showStatus(`Added "${name}"`, "ok");
});

deleteProviderBtn.addEventListener("click", async () => {
  if (!isCustomProvider(activeId)) return;
  const p = getUserProvider(activeId);
  const name = registry?.providers?.[activeId]?.name || activeId;
  if (!confirm(`Delete "${name}"?`)) return;

  providers = providers.filter((x) => x.id !== activeId);
  if (registry?.providers) delete registry.providers[activeId];
  activeId = providers[0]?.id || DEFAULT_PROVIDER_ID;
  await saveProviders();

  renderProviderDropdown();
  renderActiveProvider();
  showStatus(`Deleted "${name}"`, "info");
});

/* ── Key toggle ─────────────────────────────────────────────────────── */

toggleKeyBtn.addEventListener("click", () => {
  visible = !visible;
  apiKeyInput.type = visible ? "text" : "password";
  toggleKeyBtn.textContent = visible ? "🙈" : "👁";
});

/* ── Save / Clear ───────────────────────────────────────────────────── */

saveBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus("Please enter an API key", "err");
    return;
  }

  const userP = getUserProvider(activeId);
  if (!userP) {
    // First time saving for a registry provider — create entry
    providers.push({ id: activeId, apiKey: key, model: "" });
  } else {
    userP.apiKey = key;
  }

  showStatus("Saving...", "info");

  // Always save base URL from input (registry or custom)
  const p = getUserProvider(activeId);
  if (p) p.baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "");

  // Save model selection
  if (!modelSelect.disabled && modelSelect.value) {
    const p2 = getUserProvider(activeId);
    if (p2) p2.model = modelSelect.value;
  }

  await saveProviders();
  clearBtn.style.display = "block";
  showStatus("Saved!", "ok");

  // Re-render models with the key (for providers not in registry)
  renderModels(getUserProvider(activeId)?.model);
});

clearBtn.addEventListener("click", async () => {
  const userP = getUserProvider(activeId);
  if (!userP) return;

  userP.apiKey = "";
  userP.model = "";
  await saveProviders();

  apiKeyInput.value = "";
  clearBtn.style.display = "none";
  renderModels("");
  showStatus("Key removed", "info");
});

modelSelect.addEventListener("change", async () => {
  const model = modelSelect.value;
  const userP = getUserProvider(activeId);
  if (userP && model) {
    userP.model = model;
    await saveProviders();
  }
});

/* ── Settings ───────────────────────────────────────────────────────── */

dwellInput.addEventListener("change", async () => {
  let val = parseInt(dwellInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 30) val = 30;
  dwellInput.value = val;
  await chrome.storage.local.set({ ltDwellTime: val });
});

async function loadSettings() {
  const { ltShowUseful, ltAutoTranslate, ltDwellTime, ltPersonality } =
    await chrome.storage.local.get([
      "ltShowUseful",
      "ltAutoTranslate",
      "ltDwellTime",
      "ltPersonality",
    ]);
  toggleUseful.checked = ltShowUseful !== false;
  toggleAuto.checked = ltAutoTranslate === true;
  dwellInput.value = ltDwellTime || 5;
  dwellRow.style.display = toggleAuto.checked ? "flex" : "none";

  personalitySelect.value = ltPersonality || "blunt";
  personalityHint.textContent = PERSONALITY_HINTS[personalitySelect.value] || PERSONALITY_HINTS.blunt;

  toggleUseful.addEventListener("change", () =>
    chrome.storage.local.set({ ltShowUseful: toggleUseful.checked }),
  );
  toggleAuto.addEventListener("change", () => {
    chrome.storage.local.set({ ltAutoTranslate: toggleAuto.checked });
    dwellRow.style.display = toggleAuto.checked ? "flex" : "none";
  });

  personalitySelect.addEventListener("change", () => {
    const val = personalitySelect.value;
    chrome.storage.local.set({ ltPersonality: val });
    personalityHint.textContent = PERSONALITY_HINTS[val] || PERSONALITY_HINTS.blunt;
  });
}

/* ── Init ───────────────────────────────────────────────────────────── */

(async function init() {
  showStatus("Loading models...", "info");

  await loadProviders();

  // Fetch registry (from cache or network)
  registry = await fetchRegistry();

  renderProviderDropdown();
  renderActiveProvider();
  loadSettings();

  statusEl.className = "status";
})();
