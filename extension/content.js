(function () {
  const frameName = (window.name || "").toLowerCase();
  const isTopWindow = window === window.top;
  const isActionFrame = frameName === "d_act";
  const isMenuFrame = frameName === "d_menu";
  const TOGGLE_HIDDEN_KEY = "apehaHelperToggleHiddenV1";
  const ROUND_STATUS_CACHE_KEY = "apehaHelperRoundStatusCacheV1";
  const MAIN_TAB_KEY = "apehaHelperMainTabV1";
  const GAME_FEATURES_KEY = "apehaHelperGameFeaturesV1";
  const LAST_JOIN_REQUEST_KEY = "apehaHelperLastJoinRequestV1";
  const BATTLE_WATCH_KEY = "apehaHelperBattleWatchV1";
  const LAST_ACTIVITY_KEY = "apehaHelperLastUserActivityV1";
  const IDLE_THRESHOLD_MS = 60 * 1000;
  const REFRESH_DELAY_MIN_MS = 4000;
  const REFRESH_DELAY_RANGE_MS = 4500;
  const ACTIVITY_EVENTS = ["mousemove", "mousedown", "click", "keydown", "wheel", "touchstart"];
  let activityThrottleTs = 0;

  function getSharedTopWindow() {
    try {
      return window.top || window;
    } catch (_e) {
      return window;
    }
  }

  function ensureSharedAudioContext() {
    const sharedWindow = getSharedTopWindow();
    if (sharedWindow.__apehaHelperAudioContext) return sharedWindow.__apehaHelperAudioContext;
    const AudioCtor =
      window.AudioContext ||
      window.webkitAudioContext ||
      sharedWindow.AudioContext ||
      sharedWindow.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      const ctx = new AudioCtor();
      sharedWindow.__apehaHelperAudioContext = ctx;
      return ctx;
    } catch (_e) {
      return null;
    }
  }

  function primeSharedAudioContext() {
    const ctx = ensureSharedAudioContext();
    if (!ctx || ctx.state !== "suspended" || typeof ctx.resume !== "function") return;
    try {
      ctx.resume().catch(() => {});
    } catch (_e) {}
  }

  function markUserActivity() {
    const now = Date.now();
    if (now - activityThrottleTs >= 250) {
      activityThrottleTs = now;
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch (_e) {}
    }
    primeSharedAudioContext();
  }

  ACTIVITY_EVENTS.forEach((eventName) => {
    try {
      document.addEventListener(eventName, markUserActivity, true);
    } catch (_e) {}
  });

  if (!isTopWindow && !isActionFrame && !isMenuFrame) return;
  if (isMenuFrame) {
    if (window.__apehaHelperClockHookLoaded) return;
    window.__apehaHelperClockHookLoaded = true;
    const bindClockHotkey = () => {
      const clock = document.getElementById("clock");
      if (!clock) return false;
      clock.addEventListener("contextmenu", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopPropagation();
        localStorage.setItem(TOGGLE_HIDDEN_KEY, "0");
        try {
          if (window.top && window.top.frames && window.top.frames.d_act && window.top.frames.d_act.location) {
            window.top.frames.d_act.location.reload();
          }
        } catch (_e) {}
      }, true);
      return true;
    };
    if (!bindClockHotkey()) {
      let tries = 0;
      const timer = window.setInterval(() => {
        tries++;
        if (bindClockHotkey() || tries > 30) window.clearInterval(timer);
      }, 300);
    }
    return;
  }
  // In frameset arena layout render helper inside d_act frame,
  // because top frameset document cannot display regular overlay UI.
  if (isTopWindow && document.querySelector("frameset")) return;

  const hasBattleContext = (() => {
    try {
      const href = (window.location && window.location.href ? window.location.href : "").toLowerCase();
      const activeBattleWatch = !!loadBattleWatch();
      if (window.frames && window.frames.d_act) return true;
      if (window.frames && window.frames.d_menu) return true;
      if (document.querySelector('frame[name="d_act"], iframe[name="d_act"]')) return true;
      if (document.querySelector('frame[name="d_menu"], iframe[name="d_menu"]')) return true;
      try {
        if (window.top && window.top.frames && window.top.frames.d_menu) return true;
      } catch (_e) {}
      if (
        href.includes("arena_room") ||
        href.includes("castle_cid") ||
        href.includes("/mbattle.html") ||
        href.includes("mbattle.html?") ||
        href.includes("/combat_bid_") ||
        href.includes("/endbattle.html") ||
        href.includes("/animate_bid_") ||
        href.includes("/animate_all_")
      ) return true;
      if (isActionFrame && activeBattleWatch) return true;
      return false;
    } catch (_e) {
      return true;
    }
  })();
  if (!hasBattleContext) return;
  if (window.__apehaHelperLoaded) return;
  window.__apehaHelperLoaded = true;

  const POS_KEY = "apehaHelperPosV1";
  const PANEL_OPEN_KEY = "apehaHelperPanelOpenV1";
  const WATCH_KEY = "apehaHelperWatchBlocksV2";
  const WATCH_HL_KEY = "apehaHelperWatchHighlightFlagsV1";
  const WATCH_TEAM_KEY = "apehaHelperWatchTeamModeV1";
  const DEFAULT_ROWS = 5;
  const DRAG_SNAP_RIGHT_PX = 14;

  const root = document.createElement("div");
  root.id = "apeha-helper-root";
  root.className = "is-collapsed";
  // Failsafe: keep toggle visible even if page CSS breaks our stylesheet.
  root.style.position = "fixed";
  root.style.right = "0";
  root.style.top = "45%";
  root.style.zIndex = "2147483000";

  const toggle = document.createElement("button");
  toggle.id = "apeha-helper-toggle";
  toggle.type = "button";
  toggle.textContent = "Helper";
  toggle.className = "drag-handle";

  const panel = document.createElement("div");
  panel.id = "apeha-helper-panel";

  const body = document.createElement("div");
  body.id = "apeha-helper-body";

  const nav = document.createElement("div");
  nav.id = "apeha-helper-nav";

  const battleTabBtn = document.createElement("button");
  battleTabBtn.type = "button";
  battleTabBtn.className = "apeha-helper-tab-btn";
  battleTabBtn.textContent = "Бой";

  const gameTabBtn = document.createElement("button");
  gameTabBtn.type = "button";
  gameTabBtn.className = "apeha-helper-tab-btn";
  gameTabBtn.textContent = "Игра";

  const watchArea = document.createElement("div");
  watchArea.id = "apeha-helper-watch-area";

  const battleArea = document.createElement("div");
  battleArea.id = "apeha-helper-battle-area";

  const gameArea = document.createElement("div");
  gameArea.id = "apeha-helper-game-area";

  const gameMenu = document.createElement("div");
  gameMenu.id = "apeha-helper-game-menu";

  const gameMenuTitle = document.createElement("div");
  gameMenuTitle.className = "apeha-helper-game-title";
  gameMenuTitle.textContent = "Функции";

  const gameFeatureList = document.createElement("div");
  gameFeatureList.id = "apeha-helper-game-features";


  const blocksHost = document.createElement("div");
  blocksHost.id = "apeha-helper-blocks";

  const addRowBtn = document.createElement("button");
  addRowBtn.id = "apeha-helper-add-row";
  addRowBtn.type = "button";
  addRowBtn.title = "Add row to current block";
  addRowBtn.textContent = "+";

  let watchBlocks = loadWatchBlocks();
  let watchHighlightFlags = loadWatchHighlightFlags();
  let watchTeamModes = loadWatchTeamModes();
  let activeBlockIndex = 0;
  let suppressClick = false;
  let helperDisabled = localStorage.getItem(TOGGLE_HIDDEN_KEY) === "1";
  let refreshTimerId = 0;
  let joinRoomRefreshTimeoutId = 0;
  let currentBattleId = "";
  const stickyBlackShield = new Set();
  let sidePanelClosedBattleId = "";
  let sidePanelPos = null;
  let activeSection = loadMainTab();
  let gameFeatures = loadGameFeatures();
  const rosterCtrlClickBoundDocs = new WeakSet();
  const mapCtrlClickBoundDocs = new WeakSet();
  const joinTrackingBoundDocs = new WeakSet();
  syncWatchStateShape();
  saveWatchHighlightFlags();
  syncTeamModesShape();
  saveWatchTeamModes();

  function loadMainTab() {
    const value = localStorage.getItem(MAIN_TAB_KEY);
    return value === "battle" || value === "game" ? value : "";
  }

  function saveMainTab() {
    if (activeSection === "battle" || activeSection === "game") {
      localStorage.setItem(MAIN_TAB_KEY, activeSection);
    } else {
      localStorage.removeItem(MAIN_TAB_KEY);
    }
  }

  function normalizeGameFeatures(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    return {
      requestHighlight: value.requestHighlight !== false,
      soundEnabled: value.soundEnabled !== false
    };
  }

  function loadGameFeatures() {
    try {
      return normalizeGameFeatures(JSON.parse(localStorage.getItem(GAME_FEATURES_KEY) || "null"));
    } catch (_e) {
      return normalizeGameFeatures(null);
    }
  }

  function saveGameFeatures() {
    localStorage.setItem(GAME_FEATURES_KEY, JSON.stringify(gameFeatures));
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_e) {
      return fallback;
    }
  }

  function getJoinPageSignature(doc) {
    try {
      const href = String((doc && doc.location && doc.location.href) || window.location.href || "");
      return href.replace(/#.*$/, "");
    } catch (_e) {
      return "";
    }
  }

  function loadLastJoinRequest() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LAST_JOIN_REQUEST_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return null;
      const joinId = String(parsed.joinId || "").trim();
      if (!joinId) return null;
      return {
        joinId,
        href: String(parsed.href || ""),
        signature: String(parsed.signature || parsed.href || ""),
        ts: Number(parsed.ts) || 0
      };
    } catch (_e) {
      return null;
    }
  }

  function saveLastJoinRequest(joinId, doc) {
    const cleanedId = String(joinId || "").trim();
    if (!cleanedId) return;
    const signature = getJoinPageSignature(doc || document);
    localStorage.setItem(LAST_JOIN_REQUEST_KEY, JSON.stringify({
      joinId: cleanedId,
      href: signature,
      signature,
      ts: Date.now()
    }));
  }

  function normalizeBattleWatch(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const source = value.source === "posted" ? "posted" : "join";
    return {
      active: value.active === true,
      source,
      joinId: String(value.joinId || "").trim(),
      cancelId: String(value.cancelId || "").trim(),
      signature: String(value.signature || value.href || ""),
      startedAt: Number(value.startedAt) || 0,
      lastSeenAt: Number(value.lastSeenAt) || 0,
      signaled: value.signaled === true
    };
  }

  function loadBattleWatch() {
    const parsed = readJson(BATTLE_WATCH_KEY, null);
    if (!parsed) return null;
    const normalized = normalizeBattleWatch(parsed);
    return normalized.active ? normalized : null;
  }

  function saveBattleWatch(state) {
    const normalized = normalizeBattleWatch(state);
    if (!normalized.active) {
      localStorage.removeItem(BATTLE_WATCH_KEY);
      return null;
    }
    localStorage.setItem(BATTLE_WATCH_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function clearBattleWatch() {
    localStorage.removeItem(BATTLE_WATCH_KEY);
  }

  function getLastUserActivityTs() {
    const raw = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || "0");
    return Number.isFinite(raw) ? raw : 0;
  }

  function isUserIdleForBattleWatch() {
    return Date.now() - getLastUserActivityTs() >= IDLE_THRESHOLD_MS;
  }

  function touchBattleWatch(patch) {
    const current = loadBattleWatch();
    if (!current) return null;
    return saveBattleWatch({
      ...current,
      ...patch,
      active: true,
      lastSeenAt: Date.now()
    });
  }

  function startBattleWatchJoin(joinId, doc) {
    const cleanedId = String(joinId || "").trim();
    if (!cleanedId) return null;
    const current = loadBattleWatch();
    const now = Date.now();
    return saveBattleWatch({
      active: true,
      source: "join",
      joinId: cleanedId,
      cancelId: "",
      signature: getJoinPageSignature(doc || document),
      startedAt: current && current.active && current.source === "join" && current.joinId === cleanedId ? current.startedAt : now,
      lastSeenAt: now,
      signaled: false
    });
  }

  function startBattleWatchPosted(cancelId, doc) {
    const cleanedCancelId = String(cancelId || "").trim();
    const current = loadBattleWatch();
    const now = Date.now();
    return saveBattleWatch({
      active: true,
      source: "posted",
      joinId: "",
      cancelId: cleanedCancelId,
      signature: getJoinPageSignature(doc || document),
      startedAt: current && current.active && current.source === "posted" && current.cancelId === cleanedCancelId ? current.startedAt : now,
      lastSeenAt: now,
      signaled: false
    });
  }

  function playBattleStartSignal() {
    if (!gameFeatures.soundEnabled) return;
    const ctx = ensureSharedAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended" && typeof ctx.resume === "function") ctx.resume().catch(() => {});
      const now = typeof ctx.currentTime === "number" ? ctx.currentTime : 0;
      [
        [0, 660, 0.08, "square", 0.045],
        [0.1, 880, 0.08, "square", 0.045],
        [0.2, 1320, 0.14, "square", 0.045]
      ].forEach((step) => {
        const [offset, freq, duration, type, volume] = step;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = now + offset;
        const stopAt = startAt + duration;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), startAt + Math.min(0.025, duration / 3));
        gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(stopAt + 0.01);
      });
    } catch (_e) {}
  }

  function normalizeNick(s) {
    return (s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\\(.)/g, "$1")
      .replace(/[^a-zа-я0-9]+/gi, "")
      .trim();
  }

  function toStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((x) => (typeof x === "string" ? x : ""));
  }

  function normalizeBlocks(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
      return [new Array(DEFAULT_ROWS).fill("")];
    }
    const blocks = raw.map(toStringArray).filter((b) => b.length > 0);
    if (blocks.length === 0) return [new Array(DEFAULT_ROWS).fill("")];
    if (blocks[0].length < DEFAULT_ROWS) {
      while (blocks[0].length < DEFAULT_ROWS) blocks[0].push("");
    }
    return blocks;
  }

  function loadWatchBlocks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WATCH_KEY) || "null");
      if (parsed) return normalizeBlocks(parsed);

      // Migration from old format (fixed 10 rows).
      const old = JSON.parse(localStorage.getItem("apehaHelperWatchBlocksV1") || "null");
      return normalizeBlocks(old);
    } catch (_e) {
      return [new Array(DEFAULT_ROWS).fill("")];
    }
  }

  function saveWatchBlocks() {
    localStorage.setItem(WATCH_KEY, JSON.stringify(watchBlocks));
  }

  function loadRoundStatusCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ROUND_STATUS_CACHE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object") return {};
      const out = {};
      Object.keys(parsed).forEach((battleId) => {
        const battleEntry = parsed[battleId];
        if (!battleEntry || typeof battleEntry !== "object") return;
        const rounds = {};
        if (battleEntry.rounds && typeof battleEntry.rounds === "object") {
          Object.keys(battleEntry.rounds).forEach((roundKey) => {
            const entry = battleEntry.rounds[roundKey];
            if (!entry || typeof entry !== "object") return;
            rounds[String(roundKey)] = {
              letterP: toStringArray(entry.letterP),
              letterK: toStringArray(entry.letterK)
            };
          });
        } else if (Number.isFinite(Number(battleEntry.roundNo))) {
          rounds[String(Number(battleEntry.roundNo))] = {
            letterP: toStringArray(battleEntry.letterP),
            letterK: toStringArray(battleEntry.letterK)
          };
        }
        const teams = {};
        if (battleEntry.teams && typeof battleEntry.teams === "object") {
          Object.keys(battleEntry.teams).forEach((teamKey) => {
            const entry = battleEntry.teams[teamKey];
            if (!entry || typeof entry !== "object") return;
            const teamNo = Number(teamKey);
            if (teamNo !== 0 && teamNo !== 1) return;
            const lastCurseRoundNo = Number(entry.lastCurseRoundNo);
            teams[String(teamNo)] = {
              lastCurseRoundNo: Number.isFinite(lastCurseRoundNo) ? lastCurseRoundNo : NaN,
              letterP: toStringArray(entry.letterP),
              letterK: toStringArray(entry.letterK)
            };
          });
        }
        out[battleId] = { rounds, teams };
      });
      return out;
    } catch (_e) {
      return {};
    }
  }

  function saveRoundStatusCache(cache) {
    try {
      localStorage.setItem(ROUND_STATUS_CACHE_KEY, JSON.stringify(cache || {}));
    } catch (_e) {}
  }

  function writeRoundStatusCache(cache, battleId, roundNo, letterPSet, letterKSet) {
    if (!cache || !battleId || !Number.isFinite(roundNo)) return;
    if ((!letterPSet || !letterPSet.size) && (!letterKSet || !letterKSet.size)) return;
    if (!cache[battleId] || typeof cache[battleId] !== "object") cache[battleId] = { rounds: {} };
    if (!cache[battleId].rounds || typeof cache[battleId].rounds !== "object") cache[battleId].rounds = {};

    const roundKey = String(roundNo);
    const existing = cache[battleId].rounds[roundKey] || {};
    const nextLetterP = letterPSet && letterPSet.size ? Array.from(letterPSet) : toStringArray(existing.letterP);
    const nextLetterK = letterKSet && letterKSet.size ? Array.from(letterKSet) : toStringArray(existing.letterK);
    if (!nextLetterP.length && !nextLetterK.length) return;

    cache[battleId].rounds[roundKey] = {
      letterP: nextLetterP,
      letterK: nextLetterK
    };

    const roundKeys = Object.keys(cache[battleId].rounds)
      .map((key) => Number(key))
      .filter((key) => Number.isFinite(key))
      .sort((a, b) => b - a);
    roundKeys.slice(8).forEach((oldRoundNo) => {
      delete cache[battleId].rounds[String(oldRoundNo)];
    });
  }

  function writeTeamCurseCache(cache, battleId, teamId, roundNo, letterPSet, letterKSet) {
    if (!cache || !battleId || !Number.isFinite(roundNo)) return;
    if (teamId !== 0 && teamId !== 1) return;
    if (!letterPSet || !letterPSet.size) return;
    if (!cache[battleId] || typeof cache[battleId] !== "object") cache[battleId] = { rounds: {}, teams: {} };
    if (!cache[battleId].teams || typeof cache[battleId].teams !== "object") cache[battleId].teams = {};
    cache[battleId].teams[String(teamId)] = {
      lastCurseRoundNo: roundNo,
      letterP: Array.from(letterPSet || []),
      letterK: Array.from(letterKSet || [])
    };
  }

  function normalizeHighlightFlags(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
      return [new Array(DEFAULT_ROWS).fill(true)];
    }
    const flags = raw.map((block) => {
      if (!Array.isArray(block) || block.length === 0) return [true];
      return block.map((x) => x !== false);
    });
    if (flags[0].length < DEFAULT_ROWS) {
      while (flags[0].length < DEFAULT_ROWS) flags[0].push(true);
    }
    return flags;
  }

  function loadWatchHighlightFlags() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WATCH_HL_KEY) || "null");
      return normalizeHighlightFlags(parsed);
    } catch (_e) {
      return [new Array(DEFAULT_ROWS).fill(true)];
    }
  }

  function saveWatchHighlightFlags() {
    localStorage.setItem(WATCH_HL_KEY, JSON.stringify(watchHighlightFlags));
  }

  function loadWatchTeamModes() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WATCH_TEAM_KEY) || "null");
      if (!Array.isArray(parsed) || !parsed.length) return [0];
      return parsed.map((x) => (x === -1 || x === 1 ? x : 0));
    } catch (_e) {
      return [0];
    }
  }

  function saveWatchTeamModes() {
    localStorage.setItem(WATCH_TEAM_KEY, JSON.stringify(watchTeamModes));
  }

  function syncWatchStateShape() {
    while (watchHighlightFlags.length < watchBlocks.length) watchHighlightFlags.push([]);
    while (watchHighlightFlags.length > watchBlocks.length) watchHighlightFlags.pop();
    watchBlocks.forEach((block, bi) => {
      if (!Array.isArray(watchHighlightFlags[bi])) watchHighlightFlags[bi] = [];
      while (watchHighlightFlags[bi].length < block.length) watchHighlightFlags[bi].push(true);
      while (watchHighlightFlags[bi].length > block.length) watchHighlightFlags[bi].pop();
    });
  }

  function syncTeamModesShape() {
    while (watchTeamModes.length < watchBlocks.length) watchTeamModes.push(0);
    while (watchTeamModes.length > watchBlocks.length) watchTeamModes.pop();
  }

  function isRowHighlightEnabled(blockIndex, rowIndex) {
    syncWatchStateShape();
    return watchHighlightFlags[blockIndex][rowIndex] !== false;
  }

  function isEndBattlePage(doc) {
    try {
      const href = (doc.location && doc.location.href ? doc.location.href : "").toLowerCase();
      return href.includes("/endbattle.html");
    } catch (_e) {
      return false;
    }
  }

  function finalizeSets(alive, dead) {
    alive.forEach((nick) => {
      if (dead.has(nick)) dead.delete(nick);
    });
    return { alive, dead };
  }

  function resolveBattleDocument() {
    const candidates = [];
    const pushDoc = (doc) => {
      if (!doc) return;
      if (!candidates.includes(doc)) candidates.push(doc);
    };

    pushDoc(document);
    try {
      pushDoc(window.parent && window.parent.frames && window.parent.frames.d_act && window.parent.frames.d_act.document);
    } catch (_e) {}
    try {
      pushDoc(window.top && window.top.frames && window.top.frames.d_act && window.top.frames.d_act.document);
    } catch (_e) {}

    for (const doc of candidates) {
      try {
        const scripts = doc.querySelectorAll("script");
        for (let i = 0; i < scripts.length; i++) {
          const content = scripts[i].textContent || scripts[i].innerText || "";
          if (content.includes("var UNBS") && content.includes("var DEAD")) return doc;
        }
      } catch (_e) {}
    }

    for (const doc of candidates) {
      try {
        if (doc.getElementById("aliveshow") || doc.getElementById("deadshow")) return doc;
      } catch (_e) {}
    }

    return document;
  }

  function parseSetsFromBattleScript(doc) {
    const alive = new Set();
    const dead = new Set();
    try {
      const scripts = doc.querySelectorAll("script");
      let battleScript = "";

      for (let i = 0; i < scripts.length; i++) {
        const content = scripts[i].textContent || scripts[i].innerText || "";
        if (content.includes("var UNBS") && content.includes("var DEAD")) {
          battleScript = content;
          break;
        }
      }

      if (!battleScript) return { alive, dead };

      const deadMatch = battleScript.match(/var\s+DEAD\s*=\s*(\{[\s\S]*?\});/);
      if (deadMatch && typeof deadMatch[1] === "string") {
        const deadEntries = deadMatch[1].match(/nk:"[^"]+"/g) || [];
        for (let i = 0; i < deadEntries.length; i++) {
          const raw = deadEntries[i];
          const nick = normalizeNick(raw.replace(/^nk:"/, "").replace(/"$/, ""));
          if (nick) dead.add(nick);
        }
      }

      const unbsMatch = battleScript.match(/var\s+UNBS\s*=\s*(\{[\s\S]*?\});/);
      if (unbsMatch && typeof unbsMatch[1] === "string") {
        const playerRegex = /(\d+):\{([^}]+)\}/g;
        let p;
        while ((p = playerRegex.exec(unbsMatch[1])) !== null) {
          const playerData = p && typeof p[2] === "string" ? p[2] : "";
          if (!playerData) continue;
          const hpRaw = (playerData.match(/hp:("?-?\d+"?)/) || [])[1];
          const rawNick = (playerData.match(/nk:"([^"]+)"/) || [])[1];
          if (!rawNick) continue;
          const nick = normalizeNick(rawNick);
          if (!nick) continue;
          const hp = hpRaw ? Number(String(hpRaw).replace(/"/g, "")) : NaN;
          if (Number.isFinite(hp)) {
            if (hp <= 0) dead.add(nick);
            else alive.add(nick);
          }
        }
      }
    } catch (_e) {
      return { alive, dead };
    }

    return finalizeSets(alive, dead);
  }

  function parseSetsFromWindowVars(doc) {
    const alive = new Set();
    const dead = new Set();
    const attrName = "data-apeha-helper-battle";

    try {
      const script = doc.createElement("script");
      script.textContent = `
        (() => {
          try {
            const alive = [];
            const dead = [];
            const unbs = window.UNBS;
            const deadObj = window.DEAD;

            if (unbs && typeof unbs === "object") {
              for (const k in unbs) {
                const p = unbs[k];
                if (!p || typeof p !== "object") continue;
                const nick = typeof p.nk === "string" ? p.nk : "";
                const hp = Number(p.hp);
                if (!nick) continue;
                if (Number.isFinite(hp)) {
                  if (hp <= 0) dead.push(nick);
                  else alive.push(nick);
                }
              }
            }

            if (deadObj && typeof deadObj === "object") {
              for (const k in deadObj) {
                const p = deadObj[k];
                if (!p || typeof p !== "object") continue;
                const nick = typeof p.nk === "string" ? p.nk : "";
                if (nick) dead.push(nick);
              }
            }

            document.documentElement.setAttribute(
              "${attrName}",
              JSON.stringify({ alive, dead })
            );
          } catch (_e) {
            document.documentElement.setAttribute("${attrName}", "");
          }
        })();
      `;
      (doc.head || doc.documentElement).appendChild(script);
      script.remove();

      const raw = doc.documentElement.getAttribute(attrName) || "";
      doc.documentElement.removeAttribute(attrName);
      if (!raw) return { alive, dead };
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.alive)) {
        parsed.alive.forEach((nick) => {
          const n = normalizeNick(nick);
          if (n) alive.add(n);
        });
      }
      if (Array.isArray(parsed.dead)) {
        parsed.dead.forEach((nick) => {
          const n = normalizeNick(nick);
          if (n) dead.add(n);
        });
      }
    } catch (_e) {
      return { alive, dead };
    }

    return finalizeSets(alive, dead);
  }

  function parseSetsFromDom() {
    const alive = new Set();
    const dead = new Set();
    const aliveNode = document.getElementById("aliveshow");
    const deadNode = document.getElementById("deadshow");

    if (aliveNode) {
      const aliveLinks = aliveNode.querySelectorAll('a[class^="s"]:not([class^="s-"])');
      aliveLinks.forEach((a) => {
        const nick = normalizeNick(a.textContent);
        if (nick) alive.add(nick);
      });
    }

    if (deadNode) {
      const deadLinks = deadNode.querySelectorAll('a[class^="s-"], span[class^="s-"]');
      deadLinks.forEach((el) => {
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!txt) return;
        const parts = txt.split(" ");
        if (parts.length > 1) {
          dead.add(normalizeNick(parts.slice(1).join(" ")));
        } else {
          dead.add(normalizeNick(txt));
        }
      });
    }

    return finalizeSets(alive, dead);
  }

  function parseSetsFromDomDoc(doc) {
    const alive = new Set();
    const dead = new Set();
    const aliveNode = doc.getElementById("aliveshow");
    const deadNode = doc.getElementById("deadshow");

    if (aliveNode) {
      const aliveLinks = aliveNode.querySelectorAll('a[class^="s"]:not([class^="s-"])');
      aliveLinks.forEach((a) => {
        const nick = normalizeNick(a.textContent);
        if (nick) alive.add(nick);
      });
    }

    if (deadNode) {
      const deadLinks = deadNode.querySelectorAll('a[class^="s-"], span[class^="s-"]');
      deadLinks.forEach((el) => {
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!txt) return;
        const parts = txt.split(" ");
        if (parts.length > 1) {
          dead.add(normalizeNick(parts.slice(1).join(" ")));
        } else {
          dead.add(normalizeNick(txt));
        }
      });
    }

    return finalizeSets(alive, dead);
  }

  function getAliveDeadSets() {
    const battleDoc = resolveBattleDocument();
    const fromDom = parseSetsFromDomDoc(battleDoc);
    if (isEndBattlePage(battleDoc)) return fromDom;
    if (fromDom.alive.size || fromDom.dead.size) return fromDom;
    const fromScript = parseSetsFromBattleScript(battleDoc);
    if (fromScript.alive.size || fromScript.dead.size) return fromScript;
    return parseSetsFromWindowVars(battleDoc);
  }

  function setInputStatus(input, mode) {
    input.classList.remove("status-alive", "status-dead", "status-unknown");
    input.classList.add(mode);
  }

  function getTrackedNickSet() {
    const tracked = new Set();
    watchBlocks.forEach((block, bi) => {
      block.forEach((value, ri) => {
        if (!isRowHighlightEnabled(bi, ri)) return;
        const nick = normalizeNick(value);
        if (nick && !isInvisibleNick(nick)) tracked.add(nick);
      });
    });
    return tracked;
  }

  function isBattlePageDoc(doc) {
    if (!doc) return false;
    try {
      const href = String((doc.location && doc.location.href) || "").toLowerCase();
      if (
        href.includes("/mbattle.html") ||
        href.includes("/combat_bid_") ||
        href.includes("/animate_bid_") ||
        href.includes("/animate_all_") ||
        href.includes("/endbattle.html")
      ) return true;
      if (doc.getElementById("aliveshow") || doc.getElementById("deadshow")) return true;
      const scripts = doc.querySelectorAll("script");
      for (let i = 0; i < scripts.length; i++) {
        const content = scripts[i].textContent || scripts[i].innerText || "";
        if (content.includes("var UNBS") && content.includes("var DEAD")) return true;
      }
    } catch (_e) {}
    return false;
  }

  function findJoinForms(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return [];
    return Array.from(doc.querySelectorAll('form input[name="actBattle-Join"]')).map((input) => ({
      input,
      form: input.form || input.closest("form")
    })).filter((entry) => entry.form);
  }

  function findRequestCards(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return [];
    return Array.from(doc.querySelectorAll("table.jtable"));
  }

  function isJoinRequestPageDoc(doc) {
    if (!doc || isBattlePageDoc(doc)) return false;
    try {
      const href = String((doc.location && doc.location.href) || "").toLowerCase();
      const looksLikeArenaRoom = href.includes("arena_room") || href.includes("castle_cid");
      if (!looksLikeArenaRoom) return false;
    } catch (_e) {
      return false;
    }
    if (findJoinForms(doc).length > 0) return true;
    return findRequestCards(doc).some((card) => {
      const text = normalizeNick(card.textContent || card.innerText || "");
      return text.includes(normalizeNick("Вы подали заявку")) || text.includes(normalizeNick("Отозвать"));
    });
  }

  function clearJoinRequestHighlights(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return;
    doc.querySelectorAll(".apeha-helper-join-highlight").forEach((el) => {
      el.classList.remove("apeha-helper-join-highlight");
    });
    doc.querySelectorAll(".apeha-helper-join-fist").forEach((el) => {
      el.classList.remove("apeha-helper-join-fist");
    });
    doc.querySelectorAll(".apeha-helper-join-submit-disabled").forEach((el) => {
      el.classList.remove("apeha-helper-join-submit-disabled");
      if ("disabled" in el) el.disabled = false;
      el.removeAttribute("aria-disabled");
      if (el.dataset) delete el.dataset.apehaHelperBlockedJoin;
      if (el.tagName === "INPUT") {
        const originalTitle = el.dataset && el.dataset.apehaHelperOriginalTitle;
        if (typeof originalTitle === "string") el.title = originalTitle;
        if (el.dataset) delete el.dataset.apehaHelperOriginalTitle;
      }
    });
  }

  function clearJoinRoomAutoRefresh() {
    if (joinRoomRefreshTimeoutId) {
      window.clearTimeout(joinRoomRefreshTimeoutId);
      joinRoomRefreshTimeoutId = 0;
    }
  }

  function hasGoldJoinHighlights(doc) {
    return !!(doc && typeof doc.querySelector === "function" && doc.querySelector(".apeha-helper-join-highlight"));
  }

  function getJoinRoomRefreshButton(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return null;
    const buttons = Array.from(doc.querySelectorAll('button[title="Обновить"], input[type="button"][title="Обновить"], input[type="submit"][title="Обновить"]'));
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const onclick = String(btn.getAttribute("onclick") || "");
      if (onclick.includes("actReload")) return btn;
    }
    return null;
  }

  function triggerJoinRoomRefresh() {
    clearJoinRoomAutoRefresh();
    const watch = loadBattleWatch();
    if (helperDisabled || !gameFeatures.requestHighlight || !watch || !watch.active) return;
    if (!isUserIdleForBattleWatch()) return;
    if (isBattlePageDoc(document)) return;
    const refreshButton = getJoinRoomRefreshButton(document);
    if (!refreshButton) return;
    try {
      refreshButton.click();
    } catch (_e) {
      try {
        if (typeof window.actReload === "function") window.actReload();
      } catch (_e2) {}
    }
  }

  function syncJoinRoomAutoRefresh() {
    clearJoinRoomAutoRefresh();
    const watch = loadBattleWatch();
    if (helperDisabled || !gameFeatures.requestHighlight || !watch || !watch.active) return;
    if (!isUserIdleForBattleWatch()) return;
    if (isBattlePageDoc(document)) return;
    if (!getJoinRoomRefreshButton(document)) return;
    const delayMs = REFRESH_DELAY_MIN_MS + Math.floor(Math.random() * REFRESH_DELAY_RANGE_MS);
    joinRoomRefreshTimeoutId = window.setTimeout(() => {
      joinRoomRefreshTimeoutId = 0;
      triggerJoinRoomRefresh();
    }, delayMs);
  }

  function findJoinRequestContainer(form) {
    if (!form || typeof form.closest !== "function") return null;
    return form.closest("table.jtable") || form.closest("table") || form.parentElement;
  }

  function getCardText(card) {
    return String((card && (card.textContent || card.innerText)) || "");
  }

  function isFistJoinRequest(entry) {
    const form = entry && entry.form ? entry.form : null;
    const container = form ? findJoinRequestContainer(form) : null;
    const text = String((container && (container.textContent || container.innerText)) || (form && (form.textContent || form.innerText)) || "");
    return normalizeNick(text).includes(normalizeNick("Кулачный"));
  }

  function isOwnPostedJoinRequest(entry) {
    const form = entry && entry.form ? entry.form : null;
    const container = entry && entry.container
      ? entry.container
      : (form ? findJoinRequestContainer(form) : null);
    const text = getCardText(container || form);
    return normalizeNick(text).includes(normalizeNick("Вы подали заявку"));
  }

  function getCancelButtonForEntry(entry) {
    if (entry && entry.cancelButton) return entry.cancelButton;
    const form = entry && entry.form ? entry.form : null;
    const container = form ? findJoinRequestContainer(form) : null;
    if (container && typeof container.querySelector === "function") {
      const btn = container.querySelector('input[type="button"][value="Отозвать"], button[value="Отозвать"]');
      if (btn) return btn;
    }
    return null;
  }

  function extractCancelId(node) {
    const onclick = String((node && node.getAttribute && node.getAttribute("onclick")) || "");
    const match = onclick.match(/actBattle-Cancel_(\d+)/i);
    return match && match[1] ? String(match[1]) : "";
  }

  function stopBattleWatch() {
    clearBattleWatch();
    localStorage.removeItem(LAST_JOIN_REQUEST_KEY);
    clearJoinRoomAutoRefresh();
  }

  function maybeHandleBattleStart() {
    const watch = loadBattleWatch();
    if (!watch || !watch.active) return false;
    if (!isBattlePageDoc(document)) return false;
    touchBattleWatch({ signaled: true });
    playBattleStartSignal();
    stopBattleWatch();
    clearJoinRequestHighlights(document);
    return true;
  }

  function getJoinSubmitControls(form) {
    if (!form || typeof form.querySelectorAll !== "function") return [];
    return Array.from(form.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])'));
  }

  function setJoinFormBlocked(form, blocked) {
    getJoinSubmitControls(form).forEach((control) => {
      control.classList.toggle("apeha-helper-join-submit-disabled", !!blocked);
      if ("disabled" in control) control.disabled = !!blocked;
      if (blocked) {
        control.setAttribute("aria-disabled", "true");
        if (control.dataset) {
          control.dataset.apehaHelperBlockedJoin = "1";
          if (control.tagName === "INPUT") control.dataset.apehaHelperOriginalTitle = control.title || "";
        }
        control.title = "Кулачные заявки заблокированы helper";
      } else {
        control.removeAttribute("aria-disabled");
        if (control.dataset) {
          delete control.dataset.apehaHelperBlockedJoin;
          if (control.tagName === "INPUT") {
            const originalTitle = control.dataset.apehaHelperOriginalTitle;
            control.title = typeof originalTitle === "string" ? originalTitle : "";
            delete control.dataset.apehaHelperOriginalTitle;
          }
        } else {
          control.title = "";
        }
      }
    });
  }

  function refreshJoinRequestHighlights() {
    clearJoinRequestHighlights(document);
    if (helperDisabled || !gameFeatures.requestHighlight) {
      stopBattleWatch();
      return;
    }
    if (!isJoinRequestPageDoc(document)) {
      clearJoinRoomAutoRefresh();
      return;
    }
    const entries = findJoinForms(document);
    const cards = findRequestCards(document);
    let observedPosted = null;
    let observedJoin = null;
    const tracked = loadLastJoinRequest();
    const currentSignature = getJoinPageSignature(document);

    entries.forEach((entry) => {
      if (!entry || !entry.form) return;
      const container = findJoinRequestContainer(entry.form);
      const isFist = isFistJoinRequest(entry);
      if (container && isFist) container.classList.add("apeha-helper-join-fist");
      if (container && isOwnPostedJoinRequest(entry)) {
        container.classList.add("apeha-helper-join-highlight");
        const cancelId = extractCancelId(getCancelButtonForEntry(entry));
        if (cancelId) {
          observedPosted = {
            source: "posted",
            cancelId,
            signature: currentSignature
          };
        }
      }
      if (tracked && tracked.joinId) {
        const joinId = String(entry.input.value || "").trim();
        if (joinId && joinId === tracked.joinId && (!tracked.signature || tracked.signature === currentSignature)) {
          if (container) container.classList.add("apeha-helper-join-highlight");
          observedJoin = {
            source: "join",
            joinId,
            signature: currentSignature
          };
        }
      }
      setJoinFormBlocked(entry.form, isFist);
    });

    cards.forEach((card) => {
      const entry = {
        form: card.querySelector("form"),
        container: card,
        cancelButton: card.querySelector('input[type="button"][value="Отозвать"], button[value="Отозвать"]')
      };
      if (!isOwnPostedJoinRequest(entry)) return;
      card.classList.add("apeha-helper-join-highlight");
      const cancelId = extractCancelId(entry.cancelButton);
      if (cancelId) {
        observedPosted = {
          source: "posted",
          cancelId,
          signature: currentSignature
        };
      }
    });

    if (observedPosted) {
      startBattleWatchPosted(observedPosted.cancelId, document);
    } else if (observedJoin) {
      startBattleWatchJoin(observedJoin.joinId, document);
    } else if (loadBattleWatch()) {
      stopBattleWatch();
    }
    syncJoinRoomAutoRefresh();
  }

  function ensureJoinRequestTracking() {
    if (!isJoinRequestPageDoc(document) || joinTrackingBoundDocs.has(document)) return;
    joinTrackingBoundDocs.add(document);

    document.addEventListener("submit", (e) => {
      const form = e && e.target;
      if (!form || typeof form.querySelector !== "function") return;
      const joinInput = form.querySelector('input[name="actBattle-Join"]');
      if (!joinInput) return;
      if (gameFeatures.requestHighlight && isFistJoinRequest({ form, input: joinInput })) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      saveLastJoinRequest(joinInput.value, document);
      startBattleWatchJoin(joinInput.value, document);
    }, true);

    document.addEventListener("click", (e) => {
      const target = e && e.target;
      if (!target || typeof target.closest !== "function") return;
      const cancelBtn = target.closest('input[type="button"][value="Отозвать"], button[value="Отозвать"]');
      if (cancelBtn) {
        const cancelId = extractCancelId(cancelBtn);
        const watch = loadBattleWatch();
        if (watch && watch.active && watch.source === "posted" && cancelId && watch.cancelId === cancelId) {
          stopBattleWatch();
          clearJoinRequestHighlights(document);
        }
        return;
      }
      const submit = target.closest('input[type="submit"], button[type="submit"], button:not([type])');
      if (!submit) return;
      const form = submit.form || submit.closest("form");
      if (!form || typeof form.querySelector !== "function") return;
      const joinInput = form.querySelector('input[name="actBattle-Join"]');
      if (!joinInput) return;
      if (gameFeatures.requestHighlight && isFistJoinRequest({ form, input: joinInput })) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      saveLastJoinRequest(joinInput.value, document);
      startBattleWatchJoin(joinInput.value, document);
    }, true);
  }

  function extractNickDisplayFromMapTitle(title) {
    let txt = (title || "").replace(/\[[^\]]*]\s*$/, "").trim();
    if (!txt) return "";
    const parts = txt.split(/\s+/);
    if (parts.length > 1 && /^[a-zа-я]{1,3}$/i.test(parts[0])) {
      txt = parts.slice(1).join(" ");
    }
    return txt.replace(/\s+/g, " ").trim();
  }

  function extractNickFromMapTitle(title) {
    return normalizeNick(extractNickDisplayFromMapTitle(title));
  }

  function isInvisibleNick(nick) {
    return nick === normalizeNick("Невидимка");
  }

  function getAlwaysTrackedNickSet() {
    const tracked = new Set();
    watchBlocks.forEach((block) => {
      block.forEach((value) => {
        const nick = normalizeNick(value);
        if (nick && !isInvisibleNick(nick)) tracked.add(nick);
      });
    });
    return tracked;
  }

  function getActiveTeamMode() {
    syncTeamModesShape();
    return watchTeamModes[activeBlockIndex] || 0; // -1 blue, 0 none, 1 red
  }

  function getNickDisplayMap(doc, icons) {
    const out = new Map();
    const pri = new Map();
    if (!doc) return out;

    const put = (raw, priority) => {
      const display = String(raw || "").replace(/\s+/g, " ").trim();
      if (!display) return;
      const key = normalizeNick(display);
      if (!key || isInvisibleNick(key)) return;
      const currentPri = pri.has(key) ? pri.get(key) : 999;
      const currentDisplay = out.get(key) || "";
      const shouldReplace =
        priority < currentPri ||
        (priority === currentPri && display.length > currentDisplay.length);
      if (!shouldReplace) return;
      pri.set(key, priority);
      out.set(key, display);
    };

    (icons || []).forEach((img) => {
      put(extractNickDisplayFromMapTitle(img.getAttribute("title") || ""), 1);
    });

    const alive = doc.getElementById("aliveshow");
    const dead = doc.getElementById("deadshow");
    const collectRoster = (container, inDeadList) => {
      if (!container) return;
      container.querySelectorAll("a,span").forEach((el) => {
        put(extractNickFromRosterElement(el, inDeadList), 2);
      });
    };
    collectRoster(alive, false);
    collectRoster(dead, true);

    const attrName = "data-apeha-helper-display-map-fallback";
    try {
      const script = doc.createElement("script");
      script.textContent = `
        (() => {
          try {
            const out = [];
            const add = (obj) => {
              if (!obj || typeof obj !== "object") return;
              for (const k in obj) {
                const p = obj[k];
                if (!p || typeof p !== "object") continue;
                if (typeof p.nk !== "string") continue;
                out.push(p.nk);
              }
            };
            add(window.UNBS);
            add(window.DEAD);
            document.documentElement.setAttribute("${attrName}", JSON.stringify(out));
          } catch (_e) {
            document.documentElement.setAttribute("${attrName}", "");
          }
        })();
      `;
      (doc.head || doc.documentElement).appendChild(script);
      script.remove();
      const raw = doc.documentElement.getAttribute(attrName) || "";
      doc.documentElement.removeAttribute(attrName);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((nick) => put(nick, 3));
        }
      }
    } catch (_e) {}

    return out;
  }

  function getNickTeamMap() {
    const map = new Map();
    const stats = {
      aliveS0: 0,
      aliveS1: 0,
      deadS0: 0,
      deadS1: 0,
      totalS0: 0,
      totalS1: 0,
      fallback0: 0,
      fallback1: 0
    };
    const doc = resolveBattleDocument();
    if (!doc) return { map, stats };
    const attrName = "data-apeha-helper-team-map-fallback";

    const parseTeamClass = (className) => {
      const m = String(className || "").match(/(?:^|\s)s([01])(?:\s|$)/);
      if (!m) return null;
      const sd = Number(m[1]);
      return sd === 0 || sd === 1 ? sd : null;
    };

    const collectFromNode = (node, source) => {
      if (!node) return;
      const els = node.querySelectorAll("a.s0,a.s1,span.s0,span.s1");
      els.forEach((el) => {
        const sd = parseTeamClass(el.className);
        if (sd === null) return;
        const nick = normalizeNick(el.textContent || "");
        if (!nick || isInvisibleNick(nick)) return;
        if (source === "dead") {
          if (sd === 0) stats.deadS0++;
          else stats.deadS1++;
        } else {
          if (sd === 0) stats.aliveS0++;
          else stats.aliveS1++;
        }
        map.set(nick, sd);
      });
    };

    collectFromNode(doc.getElementById("deadshow"), "dead");
    collectFromNode(doc.getElementById("aliveshow"), "alive");

    doc.querySelectorAll('img[id^="pr_"][title][src]').forEach((img) => {
      const nick = extractNickFromMapTitle(img.getAttribute("title") || "");
      if (!nick || isInvisibleNick(nick) || map.has(nick)) return;
      const src = String(img.getAttribute("src") || "").toLowerCase();
      let sd = null;
      if (/(^|\/)pb0d?\.(png|gif)(\?|$)/.test(src) || /pb0d?\.(png|gif)/.test(src)) sd = 0;
      if (/(^|\/)pb1d?\.(png|gif)(\?|$)/.test(src) || /pb1d?\.(png|gif)/.test(src)) sd = 1;
      if (sd === 0 || sd === 1) map.set(nick, sd);
    });

    try {
      const script = doc.createElement("script");
      script.textContent = `
        (() => {
          try {
            const out = {};
            const add = (obj) => {
              if (!obj || typeof obj !== "object") return;
              for (const k in obj) {
                const p = obj[k];
                if (!p || typeof p !== "object") continue;
                if (typeof p.nk !== "string") continue;
                const sd = Number(p.sd);
                if (!Number.isFinite(sd)) continue;
                out[p.nk] = sd;
              }
            };
            add(window.UNBS);
            add(window.DEAD);
            document.documentElement.setAttribute("${attrName}", JSON.stringify(out));
          } catch (_e) {
            document.documentElement.setAttribute("${attrName}", "");
          }
        })();
      `;
      (doc.head || doc.documentElement).appendChild(script);
      script.remove();

      const raw = doc.documentElement.getAttribute(attrName) || "";
      doc.documentElement.removeAttribute(attrName);
      if (!raw) {
        map.forEach((sd) => {
          if (sd === 0) stats.totalS0++;
          else if (sd === 1) stats.totalS1++;
        });
        return { map, stats };
      }
      const parsed = JSON.parse(raw);
      let fb0 = 0;
      let fb1 = 0;
      Object.keys(parsed || {}).forEach((rawNick) => {
        const nick = normalizeNick(rawNick);
        if (!nick || isInvisibleNick(nick)) return;
        const sd = Number(parsed[rawNick]);
        if (!Number.isFinite(sd)) return;
        if (sd === 0) fb0++;
        if (sd === 1) fb1++;
        if (!map.has(nick) && (sd === 0 || sd === 1)) map.set(nick, sd);
      });
      stats.fallback0 = fb0;
      stats.fallback1 = fb1;
    } catch (_e) {
      map.forEach((sd) => {
        if (sd === 0) stats.totalS0++;
        else if (sd === 1) stats.totalS1++;
      });
      return { map, stats };
    }
    map.forEach((sd) => {
      if (sd === 0) stats.totalS0++;
      else if (sd === 1) stats.totalS1++;
    });
    return { map, stats };
  }

  function getCurrentRoundContext(doc) {
    const logsNode = doc && doc.getElementById ? doc.getElementById("logs") : null;
    if (!logsNode) return { lines: [], linesNorm: [], text: "", previousLines: [], previousLinesNorm: [], previousText: "" };
    const text = (logsNode.innerText || logsNode.textContent || "").replace(/\r/g, "");
    if (!text) return { lines: [], linesNorm: [], text: "", previousLines: [], previousLinesNorm: [], previousText: "" };

    let lines = text
      .split("\n")
      .map((line) => String(line || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!lines.length) return { lines: [], linesNorm: [], text: "", previousLines: [], previousLinesNorm: [], previousText: "" };

    const getRoundNo = (line) => {
      const raw = String(line || "");
      const mRaw = raw.match(/раунд\s*(?:№|#)?\s*(\d+)/i);
      if (mRaw && mRaw[1]) return Number(mRaw[1]);
      const norm = normalizeNick(raw);
      const mNorm = norm.match(/раунд(\d+)/i);
      if (mNorm && mNorm[1]) return Number(mNorm[1]);
      return NaN;
    };

    const roundIndexes = [];
    lines.forEach((line, idx) => {
      if (Number.isFinite(getRoundNo(line))) roundIndexes.push(idx);
    });

    // The battle renderer prepends new records to #logs, so current-round
    // events are always at the top and the first visible round marker closes
    // the current block.
    let previousLines = [];
    if (roundIndexes.length) {
      const firstRoundIdx = roundIndexes[0];
      lines = lines.slice(0, firstRoundIdx + 1);
      if (roundIndexes.length > 1) {
        const secondRoundIdx = roundIndexes[1];
        previousLines = text
          .split("\n")
          .map((line) => String(line || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(firstRoundIdx + 1, secondRoundIdx + 1);
      } else {
        previousLines = text
          .split("\n")
          .map((line) => String(line || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(firstRoundIdx + 1, Math.min(firstRoundIdx + 101, text.split("\n").length));
      }
    } else {
      lines = lines.slice(0, Math.min(lines.length, 100));
    }

    return {
      lines,
      linesNorm: lines.map((line) => normalizeNick(line)),
      text: lines.join("\n"),
      previousLines,
      previousLinesNorm: previousLines.map((line) => normalizeNick(line)),
      previousText: previousLines.join("\n")
    };
  }

  function detectBattleId(doc) {
    try {
      const href = (doc.location && doc.location.href ? doc.location.href : "").toLowerCase();
      const m = href.match(/(?:combat_bid_|animate_bid_|bid=)(\d+)/);
      if (m && m[1]) return m[1];
    } catch (_e) {}

    const attrName = "data-apeha-helper-bid";
    try {
      const script = doc.createElement("script");
      script.textContent = `
        (() => {
          try {
            const bid = Number(window.BID);
            document.documentElement.setAttribute("${attrName}", Number.isFinite(bid) ? String(bid) : "");
          } catch (_e) {
            document.documentElement.setAttribute("${attrName}", "");
          }
        })();
      `;
      (doc.head || doc.documentElement).appendChild(script);
      script.remove();
      const raw = doc.documentElement.getAttribute(attrName) || "";
      doc.documentElement.removeAttribute(attrName);
      if (raw) return raw;
    } catch (_e) {}

    try {
      return (doc.location && doc.location.href ? doc.location.href : "").toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  function syncBattleScope(doc) {
    const bid = detectBattleId(doc);
    if (bid && bid !== currentBattleId) {
      currentBattleId = bid;
      stickyBlackShield.clear();
      sidePanelClosedBattleId = "";
      sidePanelPos = null;
    }
  }

  function ensureMapHighlightStyle(doc) {
    const styleId = "apeha-helper-map-highlight-style";
    if (doc.getElementById(styleId)) return;
    const style = doc.createElement("style");
    style.id = styleId;
    style.textContent =
      ".apeha-helper-map-target{" +
      "background-color:rgba(255,255,0,0.78)!important;" +
      "box-shadow:0 0 0 5px #ffff00,0 0 22px 7px rgba(255,255,0,1)!important;" +
      "border-radius:50%!important;}" +
      ".apeha-helper-map-target-revive{" +
      "background-color:rgba(255,64,64,0.72)!important;" +
      "box-shadow:0 0 0 5px #ff2a2a,0 0 22px 7px rgba(255,36,36,1)!important;" +
      "border-radius:50%!important;}" +
      ".apeha-helper-map-badges{position:absolute;pointer-events:none;z-index:2147483001;overflow:visible;}" +
      ".apeha-helper-map-badge{position:absolute;display:inline-flex;align-items:center;justify-content:center;font:700 10px/10px Tahoma,Verdana,sans-serif;text-shadow:0 0 2px rgba(255,255,255,.7);}" +
      ".apeha-helper-map-badge.shield-blue{left:0;top:0;width:15px;height:15px;clip-path:polygon(50% 100%,10% 62%,10% 8%,90% 8%,90% 62%);border:1px solid #d8f0ff;background:#178dff;box-shadow:0 0 5px #29a7ff;}" +
      ".apeha-helper-map-badge.shield-black{right:0;top:0;width:15px;height:15px;clip-path:polygon(50% 100%,10% 62%,10% 8%,90% 8%,90% 62%);border:1px solid #d0d0d0;background:#111;box-shadow:0 0 5px rgba(0,0,0,.8);}" +
      ".apeha-helper-map-badge.letter-p,.apeha-helper-map-badge.letter-k,.apeha-helper-map-badge.letter-p-prev,.apeha-helper-map-badge.letter-k-prev{left:1px;right:1px;top:1px;bottom:1px;width:auto;height:auto;font-size:24px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center;text-shadow:0 0 2px rgba(255,255,255,.95),1px 0 0 currentColor,-1px 0 0 currentColor,0 1px 0 currentColor,0 -1px 0 currentColor,1px 1px 0 currentColor,-1px -1px 0 currentColor,1px -1px 0 currentColor,-1px 1px 0 currentColor;}" +
      ".apeha-helper-map-badge.letter-p{color:#0f5dff;}" +
      ".apeha-helper-map-badge.letter-k{color:#1aaf2c;}" +
      ".apeha-helper-map-badge.letter-p-prev,.apeha-helper-map-badge.letter-k-prev{color:#111;}" +
      ".apeha-helper-map-badge.mad-face{left:50%;bottom:-2px;transform:translateX(-50%);width:13px;height:13px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#ffe57a,#ffad2f 65%,#ff7a00);border:1px solid #8d3200;box-shadow:0 0 7px rgba(255,155,0,.95);}" +
      ".apeha-helper-map-badge.mad-face::before{content:'';position:absolute;left:2px;top:4px;width:2px;height:2px;border-radius:50%;background:#5f1c00;box-shadow:6px -1px 0 #5f1c00;}" +
      ".apeha-helper-map-badge.mad-face::after{content:'';position:absolute;left:2px;top:8px;width:8px;height:2px;border-radius:2px;background:linear-gradient(90deg,#5f1c00 0 15%,transparent 15% 35%,#5f1c00 35% 55%,transparent 55% 75%,#5f1c00 75% 100%);}" +
      "#apeha-helper-side-panel{position:absolute;min-width:210px;max-width:360px;min-height:80px;resize:both;overflow:auto;background:#f4e5bf;border:1px solid #c9b07f;border-radius:6px;padding:6px;color:#6f1515;font:700 11px/1.3 Tahoma,Verdana,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.2);z-index:2147483002;}" +
      "#apeha-helper-side-panel .section{margin-bottom:4px;}" +
      "#apeha-helper-side-panel .section:last-child{margin-bottom:0;}" +
      "#apeha-helper-side-panel .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;cursor:move;user-select:none;}" +
      "#apeha-helper-side-panel .close{border:1px solid #bda572;background:linear-gradient(#efe2be,#dcc595);color:#8f1414;border-radius:3px;width:16px;height:16px;line-height:14px;padding:0;cursor:pointer;}" +
      "#apeha-helper-side-panel .k{color:#7f0d0d;}" +
      "#apeha-helper-side-panel .v{font-weight:700;color:#2f1c00;}" +
      "#apeha-helper-side-panel .nick{color:#183d8f;text-decoration:underline;cursor:pointer;}" +
      "#apeha-helper-side-panel .nick.old{color:#111;}";
    (doc.head || doc.documentElement).appendChild(style);
  }

  function findActorsInLine(lineNorm, tokenNorm, nicks) {
    const idx = lineNorm.indexOf(tokenNorm);
    const head = idx >= 0 ? lineNorm.slice(0, idx) : lineNorm;
    const actors = [];
    nicks.forEach((nick) => {
      if (head.includes(nick)) actors.push(nick);
    });
    if (actors.length) return actors;
    const fallback = [];
    nicks.forEach((nick) => {
      if (lineNorm.includes(nick)) fallback.push(nick);
    });
    return fallback;
  }

  function getCurrentRoundState(allNicks) {
    const blueShield = new Set();
    const blackShieldCurrent = new Set();
    const letterP = new Set();
    const letterK = new Set();
    const letterPPrev = new Set();
    const letterKPrev = new Set();
    const mad = new Set();
    const frozen = new Set();
    const feared = new Set();
    const revived = new Set();

    if (!allNicks || !allNicks.size) {
      return { blueShield, blackShield: new Set(stickyBlackShield), letterP, letterK, letterPPrev, letterKPrev, mad, frozen, feared, revived };
    }

    const battleDoc = resolveBattleDocument();
    if (!battleDoc) {
      return { blueShield, blackShield: new Set(stickyBlackShield), letterP, letterK, letterPPrev, letterKPrev, mad, frozen, feared, revived };
    }

    syncBattleScope(battleDoc);
    const round = getCurrentRoundContext(battleDoc);
    const lines = round.linesNorm;
    if (!lines.length) {
      return { blueShield, blackShield: new Set(stickyBlackShield), letterP, letterK, letterPPrev, letterKPrev, mad, frozen, feared, revived };
    }
    const previousLines = round.previousLinesNorm || [];

    const nicks = Array.from(allNicks).filter((nick) => !isInvisibleNick(nick));
    const blueTokens = [
      "Магический панцирь",
      "Магический панцирь I ступени",
      "Магический панцирь II ступени",
      "Увернуться от удара",
      "Увернуться от удара I ступени",
      "Увернуться от удара II ступени",
      "Веерная защита",
      "Веерная защита I ступени",
      "Веерная защита II ступени"
    ].map(normalizeNick);
    const blackToken = normalizeNick("иммунитет к боевой магии");
    const pToken = normalizeNick("проклясть противника");
    const kToken = normalizeNick("боевой клич");
    const reviveToken = normalizeNick("оживить соратника");
    const useScrollToken = normalizeNick("использовал свиток");
    const interveneToken = normalizeNick("вмешался в бой");
    const madnessTokens = [
      normalizeNick("сошел с ума"),
      normalizeNick("сошла с ума"),
      normalizeNick("сошли с ума")
    ];

    lines.forEach((lineNorm, idx) => {
      if (!lineNorm) return;

      blueTokens.forEach((token) => {
        if (!lineNorm.includes(token)) return;
        findActorsInLine(lineNorm, token, nicks).forEach((nick) => blueShield.add(nick));
      });
      if (lineNorm.includes(blackToken)) {
        findActorsInLine(lineNorm, blackToken, nicks).forEach((nick) => blackShieldCurrent.add(nick));
      }
      if (lineNorm.includes(pToken)) {
        findActorsInLine(lineNorm, pToken, nicks).forEach((nick) => letterP.add(nick));
      }
      if (lineNorm.includes(kToken)) {
        findActorsInLine(lineNorm, kToken, nicks).forEach((nick) => letterK.add(nick));
      }
      if (madnessTokens.some((token) => lineNorm.includes(token))) {
        nicks.forEach((nick) => {
          if (lineNorm.includes(nick)) mad.add(nick);
        });
      }
      if (lineNorm.includes("заморож")) {
        nicks.forEach((nick) => {
          if (lineNorm.includes(nick)) frozen.add(nick);
        });
      }
      if (lineNorm.includes("испугал") || lineNorm.includes("испуган")) {
        nicks.forEach((nick) => {
          if (lineNorm.includes(nick)) feared.add(nick);
        });
      }

      if (!lineNorm.includes(interveneToken) || idx + 1 >= lines.length) return;
      const nextLine = lines[idx + 1];
      if (!nextLine.includes(useScrollToken) || !nextLine.includes(reviveToken)) return;
      findActorsInLine(lineNorm, interveneToken, nicks).forEach((nick) => revived.add(nick));
    });

    previousLines.forEach((lineNorm) => {
      if (!lineNorm) return;
      if (lineNorm.includes(pToken)) {
        findActorsInLine(lineNorm, pToken, nicks).forEach((nick) => {
          if (!letterP.has(nick)) letterPPrev.add(nick);
        });
      }
      if (lineNorm.includes(kToken)) {
        findActorsInLine(lineNorm, kToken, nicks).forEach((nick) => {
          if (!letterK.has(nick)) letterKPrev.add(nick);
        });
      }
    });

    blackShieldCurrent.forEach((nick) => stickyBlackShield.add(nick));
    return {
      blueShield,
      blackShield: new Set(stickyBlackShield),
      letterP,
      letterK,
      letterPPrev,
      letterKPrev,
      mad,
      frozen,
      feared,
      revived
    };
  }

  function decodeHtmlText(html) {
    const el = document.createElement("div");
    el.innerHTML = String(html || "");
    return (el.textContent || el.innerText || "").replace(/\s+/g, " ").trim();
  }

  function inferTeamFromLogHtmlLine(lineHtml, nickNorm) {
    if (!lineHtml || !nickNorm) return null;
    const re = /<font[^>]*class=["']s([01])["'][^>]*>([\s\S]*?)<\/font>/ig;
    let m;
    while ((m = re.exec(String(lineHtml)))) {
      const teamId = Number(m[1]);
      const rawNick = decodeHtmlText(m[2]);
      if ((teamId === 0 || teamId === 1) && normalizeNick(rawNick) === nickNorm) return teamId;
    }
    return null;
  }

  function getPkCarryoverContext(doc) {
    const logsNode = doc && doc.getElementById ? doc.getElementById("logs") : null;
    if (!logsNode) return null;
    const text = (logsNode.innerText || logsNode.textContent || "").replace(/\r/g, "");
    if (!text) return null;
    const html = String(logsNode.innerHTML || "").replace(/\r/g, "");
    const allLines = text.split("\n").map((line) => String(line || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const allHtmlLines = html.split(/<br\s*\/?>/i).map((line) => String(line || "").trim()).filter(Boolean);
    if (!allLines.length) return null;

    const getRoundNo = (line) => {
      const raw = String(line || "");
      const mRaw = raw.match(/раунд\s*(?:№|#)?\s*(\d+)/i);
      if (mRaw && mRaw[1]) return Number(mRaw[1]);
      const norm = normalizeNick(raw);
      const mNorm = norm.match(/раунд(\d+)/i);
      if (mNorm && mNorm[1]) return Number(mNorm[1]);
      return NaN;
    };

    const roundIndexes = [];
    allLines.forEach((line, idx) => {
      if (Number.isFinite(getRoundNo(line))) roundIndexes.push(idx);
    });

    let currentLines = allLines.slice();
    let currentHtmlLines = allHtmlLines.slice();
    let previousLines = [];
    let previousHtmlLines = [];
    let roundNo = NaN;
    if (roundIndexes.length) {
      const firstRoundIdx = roundIndexes[0];
      roundNo = getRoundNo(allLines[firstRoundIdx]);
      currentLines = allLines.slice(0, firstRoundIdx + 1);
      currentHtmlLines = allHtmlLines.slice(0, firstRoundIdx + 1);
      if (roundIndexes.length > 1) {
        const secondRoundIdx = roundIndexes[1];
        previousLines = allLines.slice(firstRoundIdx + 1, secondRoundIdx + 1);
        previousHtmlLines = allHtmlLines.slice(firstRoundIdx + 1, secondRoundIdx + 1);
      } else {
        previousLines = allLines.slice(firstRoundIdx + 1, Math.min(firstRoundIdx + 101, allLines.length));
        previousHtmlLines = allHtmlLines.slice(firstRoundIdx + 1, Math.min(firstRoundIdx + 101, allHtmlLines.length));
      }
    } else {
      currentLines = allLines.slice(0, Math.min(allLines.length, 100));
      currentHtmlLines = allHtmlLines.slice(0, Math.min(allHtmlLines.length, 100));
    }

    return {
      roundNo,
      currentLinesNorm: currentLines.map((line) => normalizeNick(line)),
      currentHtmlLines,
      previousLinesNorm: previousLines.map((line) => normalizeNick(line)),
      previousHtmlLines
    };
  }

  function collectPkTeams(linesNorm, htmlLines, nicks, teamMap) {
    const pToken = normalizeNick("проклясть противника");
    const kToken = normalizeNick("боевой клич");
    const letterPByTeam = new Map([[0, new Set()], [1, new Set()]]);
    const letterKByTeam = new Map([[0, new Set()], [1, new Set()]]);
    linesNorm.forEach((lineNorm, idx) => {
      if (!lineNorm) return;
      if (lineNorm.includes(pToken)) {
        findActorsInLine(lineNorm, pToken, nicks).forEach((nick) => {
          let teamId = teamMap.get(nick);
          if (teamId !== 0 && teamId !== 1) teamId = inferTeamFromLogHtmlLine((htmlLines || [])[idx], nick);
          if (teamId === 0 || teamId === 1) {
            teamMap.set(nick, teamId);
            letterPByTeam.get(teamId).add(nick);
          }
        });
      }
      if (lineNorm.includes(kToken)) {
        findActorsInLine(lineNorm, kToken, nicks).forEach((nick) => {
          let teamId = teamMap.get(nick);
          if (teamId !== 0 && teamId !== 1) teamId = inferTeamFromLogHtmlLine((htmlLines || [])[idx], nick);
          if (teamId === 0 || teamId === 1) {
            teamMap.set(nick, teamId);
            letterKByTeam.get(teamId).add(nick);
          }
        });
      }
    });
    return { letterPByTeam, letterKByTeam };
  }

  function applyPkCarryover(baseRoundState, battleDoc, allNicks, teamMap) {
    if (!baseRoundState || !battleDoc || !teamMap) return baseRoundState;
    const battleId = detectBattleId(battleDoc) || currentBattleId || "";
    const ctx = getPkCarryoverContext(battleDoc);
    if (!battleId || !ctx || !Number.isFinite(ctx.roundNo)) return baseRoundState;

    const nicks = Array.from(allNicks || []).filter((nick) => !isInvisibleNick(nick));
    const cache = loadRoundStatusCache();
    const currentTeams = collectPkTeams(ctx.currentLinesNorm || [], ctx.currentHtmlLines || [], nicks, teamMap);
    const previousTeams = collectPkTeams(ctx.previousLinesNorm || [], ctx.previousHtmlLines || [], nicks, teamMap);

    [0, 1].forEach((teamId) => {
      const teamLetterP = currentTeams.letterPByTeam.get(teamId);
      if (teamLetterP && teamLetterP.size) {
        writeTeamCurseCache(cache, battleId, teamId, ctx.roundNo, teamLetterP, currentTeams.letterKByTeam.get(teamId));
        return;
      }
      if (ctx.roundNo > 1) {
        const prevTeamLetterP = previousTeams.letterPByTeam.get(teamId);
        if (prevTeamLetterP && prevTeamLetterP.size) {
          writeTeamCurseCache(cache, battleId, teamId, ctx.roundNo - 1, prevTeamLetterP, previousTeams.letterKByTeam.get(teamId));
        }
      }
    });
    saveRoundStatusCache(cache);

    const letterPPrev = new Set(baseRoundState.letterPPrev || []);
    const letterKPrev = new Set(baseRoundState.letterKPrev || []);
    const cachedBattle = cache[battleId];
    const cachedTeams = cachedBattle && cachedBattle.teams && typeof cachedBattle.teams === "object" ? cachedBattle.teams : {};
    ["0", "1"].forEach((teamKey) => {
      const teamEntry = cachedTeams[teamKey];
      if (!teamEntry) return;
      const delta = ctx.roundNo - Number(teamEntry.lastCurseRoundNo);
      if (delta !== 1 && delta !== 2) return;
      toStringArray(teamEntry.letterP).forEach((nick) => {
        const normalized = normalizeNick(nick);
        if (!normalized || baseRoundState.letterP.has(normalized)) return;
        teamMap.set(normalized, Number(teamKey));
        letterPPrev.add(normalized);
      });
      toStringArray(teamEntry.letterK).forEach((nick) => {
        const normalized = normalizeNick(nick);
        if (!normalized || baseRoundState.letterK.has(normalized)) return;
        teamMap.set(normalized, Number(teamKey));
        letterKPrev.add(normalized);
      });
    });

    return {
      ...baseRoundState,
      letterPPrev,
      letterKPrev
    };
  }

  function filterNicksByTeam(set, teamMap, selectedTeam) {
    const out = new Set();
    if (!set || !set.size) return out;
    set.forEach((nick) => {
      if (selectedTeam === null) {
        out.add(nick);
        return;
      }
      if (teamMap.get(nick) === selectedTeam) out.add(nick);
    });
    return out;
  }

  function renderBattleSidePanel(doc, selectedTeam, teamMap, roundState, revivedDisabled, displayNameMap) {
    const mapImg = doc.getElementById("map");
    if (!mapImg) return;
    const layerHost = doc.body || doc.documentElement;
    if (!layerHost) return;
    const bid = detectBattleId(doc) || currentBattleId || "";
    if (sidePanelClosedBattleId && sidePanelClosedBattleId === bid) return;

    let sideLayer = doc.getElementById("apeha-helper-side-layer");
    if (!sideLayer) {
      sideLayer = doc.createElement("div");
      sideLayer.id = "apeha-helper-side-layer";
      layerHost.appendChild(sideLayer);
    }
    sideLayer.style.position = "absolute";
    sideLayer.style.left = "0";
    sideLayer.style.top = "0";
    sideLayer.style.zIndex = "2147483002";
    sideLayer.style.pointerEvents = "none";

    let panelNode = doc.getElementById("apeha-helper-side-panel");
    if (!panelNode) {
      panelNode = doc.createElement("div");
      panelNode.id = "apeha-helper-side-panel";
      sideLayer.appendChild(panelNode);
    }
    panelNode.style.pointerEvents = "auto";

    const mapRect = mapImg.getBoundingClientRect ? mapImg.getBoundingClientRect() : { left: 0, top: 0 };
    const scrollX = doc.defaultView ? (doc.defaultView.scrollX || doc.defaultView.pageXOffset || 0) : 0;
    const scrollY = doc.defaultView ? (doc.defaultView.scrollY || doc.defaultView.pageYOffset || 0) : 0;
    if (sidePanelPos && sidePanelPos.bid === bid) {
      panelNode.style.left = `${sidePanelPos.left}px`;
      panelNode.style.top = `${sidePanelPos.top}px`;
    } else {
      const left = mapRect.left + scrollX + (mapImg.offsetWidth || mapRect.width || 0) + 20;
      const top = mapRect.top + scrollY;
      panelNode.style.left = `${Math.max(0, Math.round(left))}px`;
      panelNode.style.top = `${Math.max(0, Math.round(top))}px`;
    }

    const escapeHtml = (s) => String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const toList = (currentSet, previousSet) => {
      const currentItems = Array.from(filterNicksByTeam(currentSet, teamMap, selectedTeam)).map((nickKey) => ({ nickKey, old: false }));
      const previousItems = Array.from(filterNicksByTeam(previousSet, teamMap, selectedTeam))
        .filter((nickKey) => !currentSet.has(nickKey))
        .map((nickKey) => ({ nickKey, old: true }));
      const items = currentItems.concat(previousItems);
      if (!items.length) return "-";
      return items
        .map(({ nickKey, old }) => {
          const nickDisplay = (displayNameMap && displayNameMap.get(nickKey)) || nickKey;
          const safe = escapeHtml(nickDisplay);
          const href = `/info.html?nick=${encodeURIComponent(nickDisplay)}`;
          const cls = old ? "nick old" : "nick";
          return `<a class="${cls}" data-nick="${safe}" href="${href}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
        })
        .join(", ");
    };

    const sections = [
      ["прокля", toList(roundState.letterP, roundState.letterPPrev)],
      ["клич", toList(roundState.letterK, roundState.letterKPrev)],
      ["сведен с ума", toList(roundState.mad, new Set())],
      ["заморожен", toList(roundState.frozen, new Set())],
      ["неуязвим", toList(roundState.blueShield, new Set())],
      ["иммунитет", toList(roundState.blackShield, new Set())],
      ["поднят в прокле", toList(revivedDisabled, new Set())]
    ];

    panelNode.innerHTML = [
      "<div class=\"head\"><span>Статусы</span><button type=\"button\" class=\"close\" title=\"Закрыть\">×</button></div>",
      ...sections.map(([k, v]) => `<div class="section"><span class="k">${k}:</span> <span class="v">${v}</span></div>`)
    ].join("");

    const closeBtn = panelNode.querySelector(".close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        sidePanelClosedBattleId = bid;
        panelNode.remove();
      }, { once: true });
    }

    panelNode.querySelectorAll(".nick").forEach((a) => {
      a.addEventListener("click", (e) => {
        if (!e.ctrlKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const nick = a.getAttribute("data-nick") || "";
        addNickToActiveBlock(nick);
      });
    });

    const head = panelNode.querySelector(".head");
    if (head) {
      head.onmousedown = (e) => {
        if (e.button !== 0) return;
        const rect = panelNode.getBoundingClientRect();
        const sX = doc.defaultView ? (doc.defaultView.scrollX || doc.defaultView.pageXOffset || 0) : 0;
        const sY = doc.defaultView ? (doc.defaultView.scrollY || doc.defaultView.pageYOffset || 0) : 0;
        const shiftX = (e.clientX + sX) - (rect.left + sX);
        const shiftY = (e.clientY + sY) - (rect.top + sY);

        const onMove = (ev) => {
          const mvX = doc.defaultView ? (doc.defaultView.scrollX || doc.defaultView.pageXOffset || 0) : 0;
          const mvY = doc.defaultView ? (doc.defaultView.scrollY || doc.defaultView.pageYOffset || 0) : 0;
          const left = (ev.clientX + mvX) - shiftX;
          const top = (ev.clientY + mvY) - shiftY;
          panelNode.style.left = `${Math.max(0, Math.round(left))}px`;
          panelNode.style.top = `${Math.max(0, Math.round(top))}px`;
          sidePanelPos = {
            bid,
            left: Math.max(0, Math.round(left)),
            top: Math.max(0, Math.round(top))
          };
        };
        const onUp = () => {
          doc.removeEventListener("mousemove", onMove);
          doc.removeEventListener("mouseup", onUp);
        };
        doc.addEventListener("mousemove", onMove);
        doc.addEventListener("mouseup", onUp);
      };
    }
  }

  function clearBattleDecorations(doc) {
    if (!doc) return;
    doc.querySelectorAll(".apeha-helper-map-badges").forEach((el) => el.remove());
    doc.querySelectorAll('img[id^="pr_"]').forEach((img) => {
      img.classList.remove("apeha-helper-map-target", "apeha-helper-map-target-revive");
    });
    const side = doc.getElementById("apeha-helper-side-panel");
    if (side) side.remove();
    const layer = doc.getElementById("apeha-helper-side-layer");
    if (layer) layer.remove();
  }

  function isBattleSectionOpen() {
    return !root.classList.contains("is-collapsed") && activeSection === "battle";
  }

  function renderIconBadges(doc, img, badgeSets, nick) {
    if (!nick || isInvisibleNick(nick)) return;
    const badges = [];
    if (badgeSets.blackShield.has(nick)) badges.push({ cls: "shield-black", title: "Иммунитет к боевой магии" });
    if (badgeSets.blueShield.has(nick)) badges.push({ cls: "shield-blue", title: "Неуязвимость" });
    if (badgeSets.letterP.has(nick)) badges.push({ cls: "letter-p", text: "П", title: "Проклясть противника: текущий раунд" });
    if (badgeSets.letterK.has(nick)) badges.push({ cls: "letter-k", text: "К", title: "Боевой клич: текущий раунд" });
    if (badgeSets.letterPPrev.has(nick)) badges.push({ cls: "letter-p-prev", text: "П", title: "Проклясть противника: прошлый раунд" });
    if (badgeSets.letterKPrev.has(nick)) badges.push({ cls: "letter-k-prev", text: "К", title: "Боевой клич: прошлый раунд" });
    if (badgeSets.mad.has(nick)) badges.push({ cls: "mad-face", title: "Сведен с ума" });
    if (!badges.length) return;

    const host = doc.createElement("span");
    host.className = "apeha-helper-map-badges";
    host.style.left = `${img.offsetLeft}px`;
    host.style.top = `${img.offsetTop}px`;
    host.style.width = `${Math.max(12, img.offsetWidth || 0)}px`;
    host.style.height = `${Math.max(12, img.offsetHeight || 0)}px`;

    badges.forEach((b) => {
      const node = doc.createElement("span");
      node.className = `apeha-helper-map-badge ${b.cls}`;
      if (b.text) node.textContent = b.text;
      if (b.title) node.title = b.title;
      host.appendChild(node);
    });

    (img.parentElement || doc.body || doc.documentElement).appendChild(host);
  }

  function refreshMapHighlights() {
    const battleDoc = resolveBattleDocument();
    if (helperDisabled || !isBattleSectionOpen()) {
      clearBattleDecorations(battleDoc);
      return;
    }
    if (!battleDoc) return;
    const icons = battleDoc.querySelectorAll('img[id^="pr_"][title]');
    if (!icons.length) {
      clearBattleDecorations(battleDoc);
      return;
    }

    ensureMapHighlightStyle(battleDoc);
    const tracked = getTrackedNickSet();
    const teamMode = getActiveTeamMode();
    const teamData = getNickTeamMap();
    let selectedTeam = null;
    if (teamMode === -1) selectedTeam = 0;
    if (teamMode === 1) selectedTeam = 1;
    const teamMap = teamData.map;

    battleDoc.querySelectorAll(".apeha-helper-map-badges").forEach((el) => el.remove());

    const allNicks = new Set();
    const nickToImg = new Map();
    icons.forEach((img) => {
      const nick = extractNickFromMapTitle(img.getAttribute("title") || "");
      if (!nick || isInvisibleNick(nick)) return;
      allNicks.add(nick);
      if (!nickToImg.has(nick)) nickToImg.set(nick, img);
    });
    const displayNameMap = getNickDisplayMap(battleDoc, icons);

    const baseRoundState = getCurrentRoundState(allNicks);
    const roundState = applyPkCarryover(baseRoundState, battleDoc, allNicks, teamMap);
    const revivedDisabled = new Set();
    roundState.revived.forEach((nick) => {
      const img = nickToImg.get(nick);
      if (!img) return;
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (/(^|\/)pb[01]d\.(png|gif)(\?|$)/.test(src) || /pb[01]d\.(png|gif)/.test(src)) {
        revivedDisabled.add(nick);
      }
    });

    const teamVisibleNicks = new Set();
    allNicks.forEach((nick) => {
      if (selectedTeam === null || teamMap.get(nick) === selectedTeam) teamVisibleNicks.add(nick);
    });

    const displayBadgeSets = {
      blackShield: filterNicksByTeam(roundState.blackShield, teamMap, selectedTeam),
      blueShield: filterNicksByTeam(roundState.blueShield, teamMap, selectedTeam),
      letterP: filterNicksByTeam(roundState.letterP, teamMap, selectedTeam),
      letterK: filterNicksByTeam(roundState.letterK, teamMap, selectedTeam),
      letterPPrev: filterNicksByTeam(roundState.letterPPrev, teamMap, selectedTeam),
      letterKPrev: filterNicksByTeam(roundState.letterKPrev, teamMap, selectedTeam),
      mad: filterNicksByTeam(roundState.mad, teamMap, selectedTeam)
    };

    icons.forEach((img) => {
      const nick = extractNickFromMapTitle(img.getAttribute("title") || "");
      const marked = nick && !isInvisibleNick(nick) && tracked.has(nick);
      const isRevivedDisabled = nick && revivedDisabled.has(nick) && teamVisibleNicks.has(nick);
      img.classList.toggle("apeha-helper-map-target", !!marked);
      img.classList.toggle("apeha-helper-map-target-revive", !!isRevivedDisabled);
      if (nick && teamVisibleNicks.has(nick)) renderIconBadges(battleDoc, img, displayBadgeSets, nick);
    });

    renderBattleSidePanel(battleDoc, selectedTeam, teamMap, roundState, revivedDisabled, displayNameMap);
  }

  function getRoundEffects(trackedNicks) {
    const shield = new Set();
    const blackShield = new Set();
    const mad = new Set();
    const frozen = new Set();
    const feared = new Set();
    if (!trackedNicks || !trackedNicks.size) return { shield, blackShield, mad, frozen, feared };

    const state = getCurrentRoundState(trackedNicks);
    trackedNicks.forEach((nick) => {
      if (state.blueShield.has(nick)) shield.add(nick);
      if (state.blackShield.has(nick)) blackShield.add(nick);
      if (state.mad.has(nick)) mad.add(nick);
      if (state.frozen.has(nick)) frozen.add(nick);
      if (state.feared.has(nick)) feared.add(nick);
    });

    return { shield, blackShield, mad, frozen, feared };
  }
  function setRowEffects(input, effectSets, nick) {
    const row = input && input.parentElement;
    if (!row) return;
    const host = row.querySelector(".apeha-helper-row-effects");
    if (!host) return;
    host.textContent = "";
    if (!nick || isInvisibleNick(nick)) return;

    const appendIcon = (cls, title) => {
      const icon = document.createElement("span");
      icon.className = `apeha-helper-effect ${cls}`;
      icon.title = title;
      host.appendChild(icon);
    };

    if (effectSets.shield.has(nick)) appendIcon("effect-shield", "Неуязвимость");
    if (effectSets.blackShield.has(nick)) appendIcon("effect-black-shield", "Иммунитет к боевой магии");
    if (effectSets.mad.has(nick)) appendIcon("effect-mad", "Сведен с ума");
    if (effectSets.frozen.has(nick)) appendIcon("effect-frozen", "Заморожен");
    if (effectSets.feared.has(nick)) appendIcon("effect-feared", "Испугался");
  }

  function extractNickFromRosterElement(el, inDeadList) {
    const txt = (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
    if (!txt) return "";
    if (!inDeadList) return txt;
    const parts = txt.split(" ");
    if (parts.length > 1) return parts.slice(1).join(" ");
    return txt;
  }

  function addNickToActiveBlock(rawNick) {
    const cleaned = String(rawNick || "").replace(/\s+/g, " ").trim();
    const nick = normalizeNick(cleaned);
    if (!nick || isInvisibleNick(nick)) return false;
    if (!watchBlocks[activeBlockIndex]) watchBlocks[activeBlockIndex] = new Array(DEFAULT_ROWS).fill("");
    if (!watchHighlightFlags[activeBlockIndex]) watchHighlightFlags[activeBlockIndex] = [];

    const exists = watchBlocks[activeBlockIndex].some((v) => normalizeNick(v) === nick);
    if (exists) return false;

    let targetRow = watchBlocks[activeBlockIndex].findIndex((v) => !normalizeNick(v));
    if (targetRow === -1) {
      targetRow = watchBlocks[activeBlockIndex].length;
      watchBlocks[activeBlockIndex].push(cleaned);
      watchHighlightFlags[activeBlockIndex].push(true);
    } else {
      watchBlocks[activeBlockIndex][targetRow] = cleaned;
      watchHighlightFlags[activeBlockIndex][targetRow] = watchHighlightFlags[activeBlockIndex][targetRow] !== false;
    }

    syncWatchStateShape();
    saveWatchBlocks();
    saveWatchHighlightFlags();
    renderWatchBlocks();
    refreshInputStatuses();
    return true;
  }

  function ensureRosterCtrlClickBinding() {
    const battleDoc = resolveBattleDocument();
    if (!battleDoc || rosterCtrlClickBoundDocs.has(battleDoc)) return;
    rosterCtrlClickBoundDocs.add(battleDoc);

    battleDoc.addEventListener("click", (e) => {
      if (!e || e.button !== 0 || !e.ctrlKey) return;
      const target = e.target;
      if (!target || typeof target.closest !== "function") return;
      const container = target.closest("#aliveshow, #deadshow");
      if (!container) return;
      const entry = target.closest("a,span");
      if (!entry) return;

      const rawNick = extractNickFromRosterElement(entry, container.id === "deadshow");
      if (!rawNick) return;

      e.preventDefault();
      e.stopPropagation();
      addNickToActiveBlock(rawNick);
    }, true);
  }

  function ensureMapCtrlClickBinding() {
    const battleDoc = resolveBattleDocument();
    if (!battleDoc || mapCtrlClickBoundDocs.has(battleDoc)) return;
    mapCtrlClickBoundDocs.add(battleDoc);

    battleDoc.addEventListener("click", (e) => {
      if (!e || e.button !== 0 || !e.ctrlKey) return;
      const target = e.target;
      if (!target || typeof target.closest !== "function") return;
      const icon = target.closest('img[id^="pr_"][title]');
      if (!icon) return;

      const rawNick = extractNickDisplayFromMapTitle(icon.getAttribute("title") || "");
      if (!rawNick) return;

      e.preventDefault();
      e.stopPropagation();
      addNickToActiveBlock(rawNick);
    }, true);
  }

  function refreshInputStatuses() {
    if (helperDisabled) {
      stopBattleWatch();
      clearBattleDecorations(resolveBattleDocument());
      clearJoinRequestHighlights(document);
      return;
    }
    if (maybeHandleBattleStart()) {
      clearJoinRequestHighlights(document);
    }
    ensureJoinRequestTracking();
    refreshJoinRequestHighlights();
    syncJoinRoomAutoRefresh();
    if (!isBattleSectionOpen()) {
      clearBattleDecorations(resolveBattleDocument());
      return;
    }
    ensureRosterCtrlClickBinding();
    ensureMapCtrlClickBinding();
    let sets = { alive: new Set(), dead: new Set() };
    try {
      sets = getAliveDeadSets();
    } catch (_e) {}
    const inputs = blocksHost.querySelectorAll("input[data-block][data-row]");
    let aliveCount = 0;
    let deadCount = 0;
    let unknownCount = 0;
    const tracked = new Set();

    inputs.forEach((input) => {
      const nick = normalizeNick(input.value);
      if (nick) tracked.add(nick);
    });
    const effectSets = getRoundEffects(tracked);

    inputs.forEach((input) => {
      const nick = normalizeNick(input.value);
      if (!nick) {
        setInputStatus(input, "status-unknown");
        setRowEffects(input, effectSets, "");
        unknownCount++;
        return;
      }
      if (sets.alive.has(nick)) {
        setInputStatus(input, "status-alive");
        aliveCount++;
      } else if (sets.dead.has(nick)) {
        setInputStatus(input, "status-dead");
        deadCount++;
      } else {
        setInputStatus(input, "status-unknown");
        unknownCount++;
      }
      setRowEffects(input, effectSets, nick);
    });

    refreshMapHighlights();
  }

  function focusBlock(index) {
    activeBlockIndex = Math.max(0, Math.min(index, watchBlocks.length - 1));
    const blocks = blocksHost.querySelectorAll(".apeha-helper-watch-block");
    blocks.forEach((el, i) => {
      el.classList.toggle("active", i === activeBlockIndex);
    });
  }

  function normalizeHelperWidth() {
    panel.style.removeProperty("width");
    body.style.removeProperty("width");
    nav.style.removeProperty("width");
    battleArea.style.removeProperty("width");
    watchArea.style.removeProperty("width");
    gameArea.style.removeProperty("width");
    blocksHost.style.removeProperty("width");
  }

  function renderGameMenu() {
    gameFeatureList.innerHTML = "";
    const item = document.createElement("div");
    item.className = "apeha-helper-game-item";

    const topRow = document.createElement("div");
    topRow.className = "apeha-helper-game-item-row";

    const mainToggle = document.createElement("label");
    mainToggle.className = "apeha-helper-game-item-toggle";

    const mainBox = document.createElement("input");
    mainBox.type = "checkbox";
    mainBox.checked = !!gameFeatures.requestHighlight;
    mainBox.addEventListener("change", () => {
      gameFeatures.requestHighlight = !!mainBox.checked;
      saveGameFeatures();
      if (!mainBox.checked) {
        stopBattleWatch();
        clearJoinRequestHighlights(document);
      }
      refreshJoinRequestHighlights();
    });

    const title = document.createElement("span");
    title.className = "apeha-helper-game-item-title";
    title.textContent = "Подсветка заявки";

    const soundToggle = document.createElement("label");
    soundToggle.className = "apeha-helper-game-item-toggle apeha-helper-game-item-toggle-sound";

    const soundBox = document.createElement("input");
    soundBox.type = "checkbox";
    soundBox.checked = !!gameFeatures.soundEnabled;
    soundBox.addEventListener("change", () => {
      gameFeatures.soundEnabled = !!soundBox.checked;
      saveGameFeatures();
    });

    const soundTitle = document.createElement("span");
    soundTitle.className = "apeha-helper-game-item-subtitle";
    soundTitle.textContent = "Звук";

    mainToggle.appendChild(mainBox);
    mainToggle.appendChild(title);
    soundToggle.appendChild(soundTitle);
    soundToggle.appendChild(soundBox);
    topRow.appendChild(mainToggle);
    topRow.appendChild(soundToggle);

    const desc = document.createElement("div");
    desc.className = "apeha-helper-game-item-desc";
    desc.textContent = "Подсвечивает заявку, отслеживает начало боя";

    item.appendChild(topRow);
    item.appendChild(desc);
    gameFeatureList.appendChild(item);
  }

  function applySectionState() {
    const menuOpen = !root.classList.contains("is-collapsed");
    const battleOpen = menuOpen && activeSection === "battle";
    const gameOpen = menuOpen && activeSection === "game";
    root.setAttribute("data-active-section", activeSection || "none");
    battleArea.classList.toggle("is-open", battleOpen);
    gameArea.classList.toggle("is-open", gameOpen);
    battleTabBtn.classList.toggle("active", battleOpen);
    gameTabBtn.classList.toggle("active", gameOpen);
    if (!battleOpen) clearBattleDecorations(resolveBattleDocument());
  }

  function toggleSection(tabName) {
    const nextSection = tabName === "game" ? "game" : "battle";
    activeSection = activeSection === nextSection ? "" : nextSection;
    saveMainTab();
    applySectionState();
    normalizeHelperWidth();
    if (!helperDisabled && isBattleSectionOpen()) refreshInputStatuses();
  }

  function renderWatchBlocks() {
    syncWatchStateShape();
    syncTeamModesShape();
    blocksHost.innerHTML = "";

    watchBlocks.forEach((block, blockIndex) => {
      const blockEl = document.createElement("div");
      blockEl.className = "apeha-helper-watch-block";
      if (blockIndex === activeBlockIndex) blockEl.classList.add("active");
      blockEl.addEventListener("mousedown", () => focusBlock(blockIndex));

      const blockHead = document.createElement("div");
      blockHead.className = "apeha-helper-watch-block-head";

      const teamSwitch = document.createElement("div");
      teamSwitch.className = "apeha-helper-team-switch";
      const currentTeamMode = (watchTeamModes[blockIndex] === -1 || watchTeamModes[blockIndex] === 1) ? watchTeamModes[blockIndex] : 0;
      const modes = [
        { v: -1, cls: "team-blue" },
        { v: 0, cls: "team-none" },
        { v: 1, cls: "team-red" }
      ];
      modes.forEach((item) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `apeha-helper-team-btn ${item.cls}`;
        if (currentTeamMode === item.v) b.classList.add("active");
        b.addEventListener("click", () => {
          watchTeamModes[blockIndex] = item.v;
          saveWatchTeamModes();
          renderWatchBlocks();
        });
        teamSwitch.appendChild(b);
      });

      const blockActions = document.createElement("div");
      blockActions.className = "apeha-helper-watch-actions";

      const addBlockBtn = document.createElement("button");
      addBlockBtn.type = "button";
      addBlockBtn.className = "apeha-helper-mini";
      addBlockBtn.title = "Add block";
      addBlockBtn.textContent = "+";
      addBlockBtn.addEventListener("click", () => {
        watchBlocks.push(new Array(DEFAULT_ROWS).fill(""));
        watchHighlightFlags.push(new Array(DEFAULT_ROWS).fill(true));
        watchTeamModes.push(0);
        activeBlockIndex = watchBlocks.length - 1;
        saveWatchBlocks();
        saveWatchHighlightFlags();
        saveWatchTeamModes();
        renderWatchBlocks();
      });
      blockActions.appendChild(addBlockBtn);

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "apeha-helper-mini";
      clearBtn.title = "Clear block";
      clearBtn.textContent = "C";
      clearBtn.addEventListener("click", () => {
        watchBlocks[blockIndex] = new Array(Math.max(DEFAULT_ROWS, watchBlocks[blockIndex].length)).fill("");
        watchHighlightFlags[blockIndex] = new Array(watchBlocks[blockIndex].length).fill(true);
        saveWatchBlocks();
        saveWatchHighlightFlags();
        saveWatchTeamModes();
        renderWatchBlocks();
      });
      blockActions.appendChild(clearBtn);

      if (blockIndex > 0) {
        const removeBlockBtn = document.createElement("button");
        removeBlockBtn.type = "button";
        removeBlockBtn.className = "apeha-helper-mini";
        removeBlockBtn.title = "Remove block";
        removeBlockBtn.textContent = "-";
        removeBlockBtn.addEventListener("click", () => {
          watchBlocks.splice(blockIndex, 1);
          watchHighlightFlags.splice(blockIndex, 1);
          watchTeamModes.splice(blockIndex, 1);
          if (activeBlockIndex >= watchBlocks.length) activeBlockIndex = watchBlocks.length - 1;
          saveWatchBlocks();
          saveWatchHighlightFlags();
          saveWatchTeamModes();
          renderWatchBlocks();
        });
        blockActions.appendChild(removeBlockBtn);
      }

      blockHead.appendChild(teamSwitch);
      blockHead.appendChild(blockActions);
      blockEl.appendChild(blockHead);

      block.forEach((value, rowIndex) => {
        const row = document.createElement("div");
        row.className = "apeha-helper-watch-row";

        const rowCheck = document.createElement("input");
        rowCheck.type = "checkbox";
        rowCheck.className = "apeha-helper-row-check";
        rowCheck.checked = isRowHighlightEnabled(blockIndex, rowIndex);
        rowCheck.title = "Highlight on map";
        rowCheck.addEventListener("change", () => {
          watchHighlightFlags[blockIndex][rowIndex] = rowCheck.checked;
          saveWatchHighlightFlags();
          refreshMapHighlights();
        });

        const input = document.createElement("input");
        input.type = "text";
        input.className = "apeha-helper-watch-input status-unknown";
        input.placeholder = `Nick ${rowIndex + 1}`;
        input.value = value || "";
        input.setAttribute("data-block", String(blockIndex));
        input.setAttribute("data-row", String(rowIndex));
        input.addEventListener("focus", () => focusBlock(blockIndex));
        input.addEventListener("blur", () => {
          watchBlocks[blockIndex][rowIndex] = input.value;
          saveWatchBlocks();
          refreshInputStatuses();
        });
        input.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          watchBlocks[blockIndex][rowIndex] = input.value;
          saveWatchBlocks();
          refreshInputStatuses();
          input.blur();
        });

        const effects = document.createElement("span");
        effects.className = "apeha-helper-row-effects";

        const clearRowBtn = document.createElement("button");
        clearRowBtn.type = "button";
        clearRowBtn.className = "apeha-helper-row-clear";
        clearRowBtn.title = "Delete row";
        clearRowBtn.textContent = "x";
        clearRowBtn.addEventListener("click", () => {
          if (watchBlocks[blockIndex].length > 1) {
            watchBlocks[blockIndex].splice(rowIndex, 1);
            watchHighlightFlags[blockIndex].splice(rowIndex, 1);
          } else {
            watchBlocks[blockIndex][0] = "";
            watchHighlightFlags[blockIndex][0] = true;
          }
          saveWatchBlocks();
          saveWatchHighlightFlags();
          renderWatchBlocks();
        });

        row.appendChild(rowCheck);
        row.appendChild(input);
        row.appendChild(effects);
        row.appendChild(clearRowBtn);
        blockEl.appendChild(row);
      });

      blocksHost.appendChild(blockEl);
    });

    focusBlock(activeBlockIndex);
    refreshInputStatuses();
    normalizeHelperWidth();
  }

  addRowBtn.addEventListener("click", () => {
    if (!watchBlocks[activeBlockIndex]) watchBlocks[activeBlockIndex] = [];
    watchBlocks[activeBlockIndex].push("");
    if (!watchHighlightFlags[activeBlockIndex]) watchHighlightFlags[activeBlockIndex] = [];
    watchHighlightFlags[activeBlockIndex].push(true);
    saveWatchBlocks();
    saveWatchHighlightFlags();
    renderWatchBlocks();
  });

  function savePanelOpen(isOpen) {
    localStorage.setItem(PANEL_OPEN_KEY, isOpen ? "1" : "0");
  }

  function isPanelOpenSaved() {
    return localStorage.getItem(PANEL_OPEN_KEY) === "1";
  }

  const openPanel = () => {
    root.classList.remove("is-collapsed");
    savePanelOpen(true);
    applySectionState();
  };
  const closePanel = () => {
    root.classList.add("is-collapsed");
    activeSection = "";
    savePanelOpen(false);
    saveMainTab();
    applySectionState();
  };
  const togglePanel = () => {
    const willOpen = root.classList.contains("is-collapsed");
    root.classList.toggle("is-collapsed");
    if (!willOpen) {
      activeSection = "";
      saveMainTab();
    }
    savePanelOpen(willOpen);
    applySectionState();
  };

  function applyHiddenState(hidden) {
    helperDisabled = !!hidden;
    localStorage.setItem(TOGGLE_HIDDEN_KEY, helperDisabled ? "1" : "0");
    if (helperDisabled) {
      root.style.display = "none";
      stopBattleWatch();
      clearBattleDecorations(resolveBattleDocument());
      clearJoinRequestHighlights(document);
    } else {
      root.style.display = "";
      refreshInputStatuses();
    }
  }

  toggle.addEventListener("click", () => {
    if (helperDisabled) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    togglePanel();
  });

  toggle.addEventListener("contextmenu", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    applyHiddenState(true);
  }, true);

  document.addEventListener("contextmenu", (e) => {
    if (!helperDisabled || !e.ctrlKey) return;
    const target = e.target;
    if (target && typeof target.closest === "function" && target.closest("#apeha-helper-root")) return;
    e.preventDefault();
    e.stopPropagation();
    applyHiddenState(false);
  }, true);

  function applyPosition(pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    const w = Math.max(36, root.offsetWidth || 36);
    const h = Math.max(24, root.offsetHeight || 24);
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    const x = clamp(Math.round(pos.x), 0, maxX);
    const y = clamp(Math.round(pos.y), 0, maxY);
    if (maxX - x <= DRAG_SNAP_RIGHT_PX) {
      root.style.left = "auto";
      root.style.right = "0";
    } else {
      root.style.left = `${x}px`;
      root.style.right = "auto";
    }
    root.style.top = `${y}px`;
  }

  function readPosition() {
    try {
      return JSON.parse(localStorage.getItem(POS_KEY) || "null");
    } catch (_e) {
      return null;
    }
  }

  function savePosition(x, y) {
    localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(v, max));
  }

  function startDrag(ev) {
    const rect = root.getBoundingClientRect();
    const shiftX = ev.clientX - rect.left;
    const shiftY = ev.clientY - rect.top;
    let moved = 0;
    let snappedRight = false;

    function onMove(e) {
      moved++;
      const maxX = Math.max(0, window.innerWidth - root.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - root.offsetHeight);
      const x = clamp(e.clientX - shiftX, 0, maxX);
      const y = clamp(e.clientY - shiftY, 0, maxY);
      snappedRight = maxX - x <= DRAG_SNAP_RIGHT_PX;
      if (snappedRight) {
        root.style.left = "auto";
        root.style.right = "0";
      } else {
        root.style.left = `${x}px`;
        root.style.right = "auto";
      }
      root.style.top = `${y}px`;
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const rect2 = root.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - root.offsetWidth);
      const x = snappedRight ? maxX : Math.round(rect2.left);
      savePosition(x, Math.round(rect2.top));
      if (moved > 2) suppressClick = true;
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  toggle.addEventListener("mousedown", startDrag);
  nav.appendChild(battleTabBtn);
  nav.appendChild(gameTabBtn);
  gameMenu.appendChild(gameMenuTitle);
  gameMenu.appendChild(gameFeatureList);
  gameArea.appendChild(gameMenu);
  watchArea.appendChild(blocksHost);
  battleArea.appendChild(watchArea);
  battleArea.appendChild(addRowBtn);
  body.appendChild(nav);
  panel.appendChild(body);
  root.appendChild(toggle);
  root.appendChild(panel);
  root.appendChild(battleArea);
  root.appendChild(gameArea);

  battleTabBtn.addEventListener("click", () => {
    toggleSection("battle");
  });

  gameTabBtn.addEventListener("click", () => {
    toggleSection("game");
  });

  (document.body || document.documentElement).appendChild(root);
  applyPosition(readPosition());
  if (!readPosition()) {
    root.style.right = "0";
    root.style.left = "auto";
  }
  if (isPanelOpenSaved()) openPanel();
  else closePanel();
  renderGameMenu();
  renderWatchBlocks();
  applySectionState();
  refreshTimerId = window.setInterval(() => {
    if (!helperDisabled) refreshInputStatuses();
  }, 1000);
  if (helperDisabled) applyHiddenState(true);
})();


















