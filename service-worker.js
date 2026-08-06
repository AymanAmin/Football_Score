const CACHE_NAME = "football-score-v1.3.3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./cloud-config.js",
  "./cloud-sync.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

const WRONG_SUPABASE_REF = "tseniigzftrxvqaspnnp";
const CORRECT_SUPABASE_REF = "tseniigzftrxvqasprnp";

function javascriptResponse(text, response) {
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function correctedCloudConfig(request) {
  const response = await fetch(request, { cache: "no-store" });
  if (!response.ok) return response;
  const text = (await response.text()).replaceAll(WRONG_SUPABASE_REF, CORRECT_SUPABASE_REF);
  return javascriptResponse(text, response);
}

const PATCHED_DELETE_MATCH = [
  "  async function deleteMatch(matchId) {",
  "    if (!ensureCanModify()) return;",
  "    const match = state.matches.find((item) => item.id === matchId);",
  "    if (!match) return;",
  "    const first = getPlayer(match.playerOneId);",
  "    const second = getPlayer(match.playerTwoId);",
  "    const confirmed = await askConfirm({",
  "      title: \"حذف المباراة؟\",",
  "      text: `سيتم حذف نتيجة ${first?.name || \"اللاعب الأول\"} و${second?.name || \"اللاعب الثاني\"} وإعادة احتساب جميع التقارير.`,",
  "      confirmText: \"حذف النتيجة\"",
  "    });",
  "    if (!confirmed) return;",
  "",
  "    state.matches = state.matches.filter((item) => item.id !== matchId);",
  "    saveState({ sync: false });",
  "    renderAll();",
  "    location.hash = \"home\";",
  "",
  "    const snapshot = cloud?.snapshot();",
  "    if (!snapshot?.authenticated || !snapshot.canWrite) {",
  "      toast(\"تم حذف المباراة وتحديث جميع الإحصائيات.\");",
  "      return;",
  "    }",
  "",
  "    if (!navigator.onLine) {",
  "      cloud.schedulePush();",
  "      toast(\"تم حذف المباراة محليًا، وستُحذف من السحابة عند عودة الإنترنت.\");",
  "      return;",
  "    }",
  "",
  "    try {",
  "      if (cloud.syncPromise) await cloud.syncPromise;",
  "      await cloud.syncNow({ forcePush: true });",
  "      toast(\"تم حذف المباراة وتحديث العداد والإحصائيات والسحابة.\");",
  "    } catch (error) {",
  "      cloud.schedulePush();",
  "      toast(\"حُذفت المباراة من الجهاز، وتعذر تحديث السحابة الآن. ستُعاد المحاولة تلقائيًا.\", \"error\");",
  "    }",
  "  }"
].join("\n");

const PATCHED_RENDER_RECENT_MATCHES = [
  "  function renderRecentMatches() {",
  "    const allMatches = sortMatches();",
  "    const totalMatches = allMatches.length;",
  "    recentMatchesVisible = Math.max(RECENT_MATCHES_PAGE_SIZE, Math.min(recentMatchesVisible, Math.max(totalMatches, RECENT_MATCHES_PAGE_SIZE)));",
  "    const matches = allMatches.slice(0, recentMatchesVisible);",
  "",
  "    if (!matches.length) {",
  "      elements.recentMatches.innerHTML = emptyState(\"i-ball\", \"لم تُسجل أي مباراة بعد\", \"أضف لاعبين ثم سجّل أول نتيجة لتبدأ الإحصائيات.\", \"تسجيل أول مباراة\", \"match\");",
  "      return;",
  "    }",
  "",
  "    const remaining = Math.max(0, totalMatches - matches.length);",
  "    const loadMoreButton = remaining > 0",
  "      ? `<div style=\"display:flex;justify-content:center;padding:8px 0 12px\"><button class=\"button button--primary\" style=\"width:100%;max-width:360px;justify-content:center\" type=\"button\" data-load-more-matches aria-controls=\"recentMatches\"><svg><use href=\"#i-chevron\"></use></svg> تحميل المزيد (${number(remaining)} متبقية)</button></div>`",
  "      : \"\";",
  "",
  "    elements.recentMatches.innerHTML = matches.map((match) => renderMatchCard(match, true)).join(\"\") + loadMoreButton;",
  "  }"
].join("\n");

async function patchedAppScript(request) {
  const response = await fetch(request, { cache: "no-store" });
  if (!response.ok) return response;
  let text = await response.text();

  if (!text.includes("RECENT_MATCHES_PAGE_SIZE")) {
    text = text.replace(
      "  let cloudAuthMode = \"login\";",
      "  let cloudAuthMode = \"login\";\n  const RECENT_MATCHES_PAGE_SIZE = 5;\n  let recentMatchesVisible = RECENT_MATCHES_PAGE_SIZE;"
    );
  }

  text = text.replace(
    "    applyState: async (remoteState) => {\n      state = normalizeState(remoteState);",
    "    applyState: async (remoteState) => {\n      state = normalizeState(remoteState);\n      recentMatchesVisible = RECENT_MATCHES_PAGE_SIZE;"
  );

  text = text.replace(
    "      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));\n      renderAll();",
    "      recentMatchesVisible = RECENT_MATCHES_PAGE_SIZE;\n      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));\n      renderAll();"
  );

  const renderRecentMatchesBlock = /  function renderRecentMatches\(\) \{[\s\S]*?\n  \}\n\n  function populatePlayerSelects/;
  if (renderRecentMatchesBlock.test(text)) {
    text = text.replace(renderRecentMatchesBlock, `${PATCHED_RENDER_RECENT_MATCHES}\n\n  function populatePlayerSelects`);
  }

  const deleteMatchBlock = /  async function deleteMatch\(matchId\) \{[\s\S]*?\n  \}\n\n  function switchReportTab/;
  if (deleteMatchBlock.test(text)) {
    text = text.replace(deleteMatchBlock, `${PATCHED_DELETE_MATCH}\n\n  function switchReportTab`);
  }

  if (!text.includes("data-load-more-matches\"]")) {
    text = text.replace(
      "      const deleteButton = event.target.closest(\"[data-delete-match]\");",
      "      const loadMoreMatchesButton = event.target.closest(\"[data-load-more-matches]\");\n      if (loadMoreMatchesButton) {\n        recentMatchesVisible += RECENT_MATCHES_PAGE_SIZE;\n        renderRecentMatches();\n        return;\n      }\n      const deleteButton = event.target.closest(\"[data-delete-match]\");"
    );
  }

  return javascriptResponse(text, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const files = APP_SHELL.filter((item) => !["./cloud-config.js", "./app.js"].includes(item));
    await cache.addAll(files);

    const cloudConfigRequest = new Request("./cloud-config.js");
    const cloudConfigResponse = await correctedCloudConfig(cloudConfigRequest);
    await cache.put(cloudConfigRequest, cloudConfigResponse.clone());

    const appRequest = new Request("./app.js");
    const appResponse = await patchedAppScript(appRequest);
    await cache.put(appRequest, appResponse.clone());
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.hostname.endsWith(".supabase.co")) return;

  if (requestUrl.pathname.endsWith("/cloud-config.js")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await correctedCloudConfig(event.request);
        await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || new Response("", { status: 503 });
      }
    })());
    return;
  }

  if (requestUrl.pathname.endsWith("/app.js")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await patchedAppScript(event.request);
        await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || new Response("", { status: 503 });
      }
    })());
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(event.request);
    const network = fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type !== "opaque") cache.put(event.request, response.clone());
        return response;
      })
      .catch(() => cached || new Response("غير متصل بالإنترنت", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    return cached || network;
  }));
});
