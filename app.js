(() => {
  "use strict";

  const STORAGE_KEY = "footballScoreApp.v1";
  const WORKSPACE_STORAGE_PREFIX = "footballScoreWorkspace.v1.";
  const APP_VERSION = 2;
  const PLAYER_COLORS = ["#12674c", "#3157a4", "#a64d63", "#7651a6", "#b76b26", "#287d89", "#824b35", "#527234"];
  const ARABIC_LOCALE = "ar-SA-u-ca-gregory";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    todayLabel: $("#todayLabel"),
    overviewStats: $("#overviewStats"),
    recentMatches: $("#recentMatches"),
    matchForm: $("#matchForm"),
    playerOne: $("#playerOne"),
    playerTwo: $("#playerTwo"),
    scoreOne: $("#scoreOne"),
    scoreTwo: $("#scoreTwo"),
    playedAt: $("#playedAt"),
    matchNote: $("#matchNote"),
    matchFormMessage: $("#matchFormMessage"),
    playersList: $("#playersList"),
    playerSearch: $("#playerSearch"),
    playerDialog: $("#playerDialog"),
    playerForm: $("#playerForm"),
    playerName: $("#playerName"),
    editingPlayerId: $("#editingPlayerId"),
    playerDialogTitle: $("#playerDialogTitle"),
    playerFormMessage: $("#playerFormMessage"),
    confirmDialog: $("#confirmDialog"),
    confirmTitle: $("#confirmTitle"),
    confirmText: $("#confirmText"),
    confirmAction: $("#confirmAction"),
    podium: $("#podium"),
    rankingTable: $("#rankingTable"),
    h2hPlayerOne: $("#h2hPlayerOne"),
    h2hPlayerTwo: $("#h2hPlayerTwo"),
    headToHeadReport: $("#headToHeadReport"),
    recordsGrid: $("#recordsGrid"),
    activityReport: $("#activityReport"),
    dataSummary: $("#dataSummary"),
    importData: $("#importData"),
    installQuickButton: $("#installQuickButton"),
    installSettingsButton: $("#installSettingsButton"),
    installDialog: $("#installDialog"),
    installInstructions: $("#installInstructions"),
    offlineBadge: $("#offlineBadge"),
    cloudStatusButton: $("#cloudStatusButton"),
    cloudStatusText: $("#cloudStatusText"),
    cloudAccountBadge: $("#cloudAccountBadge"),
    cloudDescription: $("#cloudDescription"),
    cloudAccount: $("#cloudAccount"),
    cloudAccountEmail: $("#cloudAccountEmail"),
    cloudLastSync: $("#cloudLastSync"),
    cloudPrimaryAction: $("#cloudPrimaryAction"),
    cloudSyncNow: $("#cloudSyncNow"),
    cloudConfigure: $("#cloudConfigure"),
    cloudSignOut: $("#cloudSignOut"),
    cloudWorkspacePanel: $("#cloudWorkspacePanel"),
    cloudWorkspace: $("#cloudWorkspace"),
    cloudWorkspaceRole: $("#cloudWorkspaceRole"),
    cloudReadonlyNotice: $("#cloudReadonlyNotice"),
    cloudMembersPanel: $("#cloudMembersPanel"),
    cloudMemberForm: $("#cloudMemberForm"),
    cloudMemberEmail: $("#cloudMemberEmail"),
    cloudMemberRole: $("#cloudMemberRole"),
    cloudMemberSubmit: $("#cloudMemberSubmit"),
    cloudMemberMessage: $("#cloudMemberMessage"),
    cloudMembersList: $("#cloudMembersList"),
    readOnlyBanner: $("#readOnlyBanner"),
    readOnlyBannerText: $("#readOnlyBannerText"),
    cloudDialog: $("#cloudDialog"),
    cloudDialogClose: $("#cloudDialogClose"),
    cloudSetupPanel: $("#cloudSetupPanel"),
    cloudAuthPanel: $("#cloudAuthPanel"),
    cloudConfigForm: $("#cloudConfigForm"),
    supabaseUrl: $("#supabaseUrl"),
    supabaseAnonKey: $("#supabaseAnonKey"),
    cloudConfigMessage: $("#cloudConfigMessage"),
    cloudAuthForm: $("#cloudAuthForm"),
    cloudEmail: $("#cloudEmail"),
    cloudPassword: $("#cloudPassword"),
    cloudAuthMessage: $("#cloudAuthMessage"),
    cloudAuthSubmit: $("#cloudAuthSubmit"),
    cloudBackToConfig: $("#cloudBackToConfig"),
    toastRegion: $("#toastRegion"),
    reportCanvas: $("#reportCanvas")
  };

  let state = loadState();
  let playerFilter = "all";
  let rankingMetric = "wins";
  let activeReportTab = "ranking";
  let deferredInstallPrompt = null;
  let cloudAuthMode = "login";

  const dateFormatter = new Intl.DateTimeFormat(ARABIC_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const timeFormatter = new Intl.DateTimeFormat("ar-SA", {
    hour: "numeric",
    minute: "2-digit"
  });

  const cloud = window.FootballCloud?.create({
    getState: () => state,
    hasLocalState: () => localStorage.getItem(STORAGE_KEY) !== null,
    applyState: async (remoteState) => {
      state = normalizeState(remoteState);
      saveState({ touch: false, sync: false });
      renderAll();
      toast("تم تحميل أحدث بياناتك من السحابة.");
    },
    onWorkspaceChange: async (nextWorkspace, previousWorkspace) => {
      if (previousWorkspace?.ownerId) {
        localStorage.setItem(`${WORKSPACE_STORAGE_PREFIX}${previousWorkspace.ownerId}`, JSON.stringify(state));
      }
      const cached = localStorage.getItem(`${WORKSPACE_STORAGE_PREFIX}${nextWorkspace.ownerId}`);
      try {
        state = cached ? normalizeState(JSON.parse(cached)) : createInitialState();
      } catch {
        state = createInitialState();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
    },
    onStatus: (snapshot) => renderCloudUi(snapshot),
    onAuthChange: (snapshot) => renderCloudUi(snapshot),
    onMessage: (message, type) => toast(message, type)
  }) || null;

  function createInitialState() {
    const now = new Date().toISOString();
    return {
      version: APP_VERSION,
      createdAt: now,
      updatedAt: now,
      players: [],
      matches: []
    };
  }

  function normalizeState(value) {
    const clean = createInitialState();
    if (!value || typeof value !== "object") return clean;

    const players = Array.isArray(value.players) ? value.players : [];
    const matches = Array.isArray(value.matches) ? value.matches : [];

    clean.createdAt = isValidDate(value.createdAt) ? value.createdAt : clean.createdAt;
    clean.updatedAt = isValidDate(value.updatedAt) ? value.updatedAt : clean.createdAt;
    clean.players = players
      .filter((player) => player && typeof player.id === "string" && typeof player.name === "string")
      .map((player, index) => ({
        id: player.id,
        name: player.name.trim().slice(0, 40),
        joinedAt: isValidDate(player.joinedAt) ? player.joinedAt : clean.createdAt,
        color: /^#[0-9a-f]{6}$/i.test(player.color || "") ? player.color : PLAYER_COLORS[index % PLAYER_COLORS.length],
        active: player.active !== false
      }))
      .filter((player) => player.name);

    const playerIds = new Set(clean.players.map((player) => player.id));
    clean.matches = matches
      .filter((match) => match && typeof match.id === "string" && playerIds.has(match.playerOneId) && playerIds.has(match.playerTwoId) && match.playerOneId !== match.playerTwoId)
      .map((match) => ({
        id: match.id,
        playerOneId: match.playerOneId,
        playerTwoId: match.playerTwoId,
        scoreOne: clampScore(match.scoreOne),
        scoreTwo: clampScore(match.scoreTwo),
        playedAt: isValidDate(match.playedAt) ? match.playedAt : clean.createdAt,
        createdAt: isValidDate(match.createdAt) ? match.createdAt : clean.createdAt,
        note: typeof match.note === "string" ? match.note.trim().slice(0, 80) : ""
      }));

    return clean;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeState(JSON.parse(saved)) : createInitialState();
    } catch (error) {
      console.warn("Could not read saved football data", error);
      return createInitialState();
    }
  }

  function saveState({ touch = true, sync = true } = {}) {
    try {
      state.version = APP_VERSION;
      if (touch) state.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const activeOwnerId = cloud?.snapshot().activeWorkspace?.ownerId;
      if (activeOwnerId) localStorage.setItem(`${WORKSPACE_STORAGE_PREFIX}${activeOwnerId}`, JSON.stringify(state));
      if (sync) cloud?.schedulePush();
      return true;
    } catch (error) {
      console.error("Could not save football data", error);
      toast("تعذر حفظ البيانات على الجهاز.", "error");
      return false;
    }
  }

  function isValidDate(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  }

  function clampScore(value) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.min(99, Math.max(0, number)) : 0;
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getInitials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "؟";
  }

  function getPlayer(playerId) {
    return state.players.find((player) => player.id === playerId);
  }

  function playerAvatar(player, extraClass = "") {
    const safePlayer = player || { name: "لاعب", color: PLAYER_COLORS[0] };
    return `<span class="avatar ${extraClass}" style="background:${safePlayer.color}" aria-hidden="true">${escapeHtml(getInitials(safePlayer.name))}</span>`;
  }

  function toLocalInputValue(date = new Date()) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 16);
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : timeFormatter.format(date);
  }

  function number(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat("ar-SA", { maximumFractionDigits }).format(value || 0);
  }

  function sortMatches(matches = state.matches) {
    return [...matches].sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
  }

  function getStatsMap() {
    const stats = new Map(
      state.players.map((player) => [player.id, {
        id: player.id,
        player,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        conceded: 0,
        goalDifference: 0,
        points: 0,
        winRate: 0,
        form: []
      }])
    );

    const chronological = [...state.matches].sort((a, b) => new Date(a.playedAt) - new Date(b.playedAt));
    chronological.forEach((match) => {
      const first = stats.get(match.playerOneId);
      const second = stats.get(match.playerTwoId);
      if (!first || !second) return;

      first.played += 1;
      second.played += 1;
      first.goals += match.scoreOne;
      first.conceded += match.scoreTwo;
      second.goals += match.scoreTwo;
      second.conceded += match.scoreOne;

      if (match.scoreOne > match.scoreTwo) {
        first.wins += 1;
        first.points += 3;
        first.form.push("W");
        second.losses += 1;
        second.form.push("L");
      } else if (match.scoreTwo > match.scoreOne) {
        second.wins += 1;
        second.points += 3;
        second.form.push("W");
        first.losses += 1;
        first.form.push("L");
      } else {
        first.draws += 1;
        second.draws += 1;
        first.points += 1;
        second.points += 1;
        first.form.push("D");
        second.form.push("D");
      }
    });

    stats.forEach((entry) => {
      entry.goalDifference = entry.goals - entry.conceded;
      entry.winRate = entry.played ? (entry.wins / entry.played) * 100 : 0;
      entry.form = entry.form.slice(-5);
    });
    return stats;
  }

  function getRankedPlayers(metric = rankingMetric) {
    const entries = [...getStatsMap().values()].filter((entry) => entry.played > 0);
    const metricValue = (entry) => metric === "winRate" ? entry.winRate : entry[metric];
    return entries.sort((a, b) =>
      metricValue(b) - metricValue(a) ||
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goals - a.goals ||
      a.player.name.localeCompare(b.player.name, "ar")
    );
  }

  function getMetricLabel(metric = rankingMetric) {
    return {
      wins: "فوز",
      goals: "هدف",
      points: "نقطة",
      winRate: "نسبة الفوز"
    }[metric] || "قيمة";
  }

  function getMetricDisplay(entry, metric = rankingMetric) {
    if (metric === "winRate") return `${number(entry.winRate, 1)}٪`;
    return number(entry[metric]);
  }

  function emptyState(icon, title, description, actionLabel = "", action = "") {
    const actionHtml = actionLabel
      ? `<button class="button button--primary" type="button" data-empty-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>`
      : "";
    return `<div class="empty-state"><span class="empty-state__icon"><svg><use href="#${icon}"></use></svg></span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${actionHtml}</div>`;
  }

  function renderOverview() {
    const totalGoals = state.matches.reduce((sum, match) => sum + match.scoreOne + match.scoreTwo, 0);
    const stats = getStatsMap();
    const leader = [...stats.values()].filter((entry) => entry.played > 0).sort((a, b) => b.points - a.points || b.wins - a.wins || b.goalDifference - a.goalDifference)[0];
    const average = state.matches.length ? totalGoals / state.matches.length : 0;
    const overview = [
      { label: "اللاعبون", value: state.players.filter((player) => player.active).length, sub: `${number(state.players.length)} مسجل`, icon: "i-users" },
      { label: "المباريات", value: state.matches.length, sub: "إجمالي الجولات", icon: "i-ball" },
      { label: "الأهداف", value: totalGoals, sub: `${number(average, 1)} لكل مباراة`, icon: "i-chart" },
      { label: "المتصدر", value: leader ? escapeHtml(leader.player.name) : "—", sub: leader ? `${number(leader.points)} نقطة` : "بانتظار أول مباراة", icon: "i-trophy", text: true }
    ];

    elements.overviewStats.innerHTML = overview.map((item) => `
      <article class="stat-card">
        <div class="stat-card__top"><span>${item.label}</span><span class="stat-card__icon"><svg><use href="#${item.icon}"></use></svg></span></div>
        <div><strong${item.text ? ' style="font-size:18px"' : ""}>${item.text ? item.value : number(item.value)}</strong><small>${item.sub}</small></div>
      </article>
    `).join("");
  }

  function matchResultLabel(match, playerId) {
    const isFirst = match.playerOneId === playerId;
    const mine = isFirst ? match.scoreOne : match.scoreTwo;
    const theirs = isFirst ? match.scoreTwo : match.scoreOne;
    if (mine > theirs) return "فائز";
    if (mine < theirs) return "خاسر";
    return "تعادل";
  }

  function renderMatchCard(match, allowDelete = false) {
    const first = getPlayer(match.playerOneId);
    const second = getPlayer(match.playerTwoId);
    if (!first || !second) return "";
    const deleteButton = allowDelete
      ? `<button class="match-delete" type="button" data-delete-match="${escapeHtml(match.id)}" aria-label="حذف مباراة ${escapeHtml(first.name)} و${escapeHtml(second.name)}" title="حذف المباراة"><svg><use href="#i-trash"></use></svg></button>`
      : "";
    return `
      <article class="match-card">
        ${deleteButton}
        <div class="match-card__player">${playerAvatar(first)}<span><strong>${escapeHtml(first.name)}</strong><small>${matchResultLabel(match, first.id)}</small></span></div>
        <div class="match-card__score"><span>${number(match.scoreOne)}</span><i>:</i><span>${number(match.scoreTwo)}</span></div>
        <div class="match-card__player">${playerAvatar(second)}<span><strong>${escapeHtml(second.name)}</strong><small>${matchResultLabel(match, second.id)}</small></span></div>
        <div class="match-card__meta"><span>${formatDate(match.playedAt)}</span><span class="dot"></span><span>${formatTime(match.playedAt)}</span>${match.note ? `<span class="dot"></span><span>${escapeHtml(match.note)}</span>` : ""}</div>
      </article>
    `;
  }

  function renderRecentMatches() {
    const matches = sortMatches().slice(0, 5);
    elements.recentMatches.innerHTML = matches.length
      ? matches.map((match) => renderMatchCard(match, true)).join("")
      : emptyState("i-ball", "لم تُسجل أي مباراة بعد", "أضف لاعبين ثم سجّل أول نتيجة لتبدأ الإحصائيات.", "تسجيل أول مباراة", "match");
  }

  function populatePlayerSelects() {
    const activePlayers = state.players.filter((player) => player.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const previousOne = elements.playerOne.value;
    const previousTwo = elements.playerTwo.value;
    const options = activePlayers.map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join("");
    const placeholder = activePlayers.length ? "" : '<option value="">أضف لاعبين أولاً</option>';
    elements.playerOne.innerHTML = placeholder + options;
    elements.playerTwo.innerHTML = placeholder + options;

    const hasPreviousOne = activePlayers.some((player) => player.id === previousOne);
    const hasPreviousTwo = activePlayers.some((player) => player.id === previousTwo);
    elements.playerOne.value = hasPreviousOne ? previousOne : (activePlayers[0]?.id || "");
    elements.playerTwo.value = hasPreviousTwo && previousTwo !== elements.playerOne.value
      ? previousTwo
      : (activePlayers.find((player) => player.id !== elements.playerOne.value)?.id || "");

    elements.playerOne.disabled = activePlayers.length < 2;
    elements.playerTwo.disabled = activePlayers.length < 2;
    const submit = $("button[type='submit']", elements.matchForm);
    submit.disabled = activePlayers.length < 2;

    if (activePlayers.length < 2) {
      showFormMessage(elements.matchFormMessage, "أضف لاعبين نشطين على الأقل لتسجيل مباراة.");
    } else {
      hideFormMessage(elements.matchFormMessage);
    }
  }

  function renderPlayers() {
    const query = elements.playerSearch.value.trim().toLocaleLowerCase("ar");
    const stats = getStatsMap();
    const players = [...state.players]
      .filter((player) => playerFilter === "all" || (playerFilter === "active" ? player.active : !player.active))
      .filter((player) => !query || player.name.toLocaleLowerCase("ar").includes(query))
      .sort((a, b) => Number(b.active) - Number(a.active) || new Date(b.joinedAt) - new Date(a.joinedAt));

    if (!players.length) {
      elements.playersList.innerHTML = state.players.length
        ? emptyState("i-search", "لا توجد نتائج", "جرّب اسمًا آخر أو غيّر عامل التصفية.")
        : emptyState("i-users", "ابدأ بإضافة اللاعبين", "سجّل أسماء أصدقائك مرة واحدة لتظهر في كل مباراة.", "إضافة لاعب", "add-player");
      return;
    }

    elements.playersList.innerHTML = players.map((player) => {
      const playerStats = stats.get(player.id);
      const hasMatches = playerStats.played > 0;
      const secondaryAction = hasMatches
        ? `<button class="mini-action" type="button" data-player-action="toggle" data-player-id="${escapeHtml(player.id)}" title="${player.active ? "أرشفة اللاعب" : "إعادة تنشيط اللاعب"}" aria-label="${player.active ? "أرشفة" : "إعادة تنشيط"} ${escapeHtml(player.name)}"><svg><use href="#${player.active ? "i-download" : "i-check"}"></use></svg></button>`
        : `<button class="mini-action is-danger" type="button" data-player-action="delete" data-player-id="${escapeHtml(player.id)}" title="حذف اللاعب" aria-label="حذف ${escapeHtml(player.name)}"><svg><use href="#i-trash"></use></svg></button>`;
      return `
        <article class="player-card ${player.active ? "" : "is-archived"}">
          ${playerAvatar(player)}
          <div class="player-card__name"><strong>${escapeHtml(player.name)}</strong><small>${player.active ? `انضم ${formatDate(player.joinedAt)}` : "لاعب مؤرشف"}</small></div>
          <div class="player-card__actions"><button class="mini-action" type="button" data-player-action="edit" data-player-id="${escapeHtml(player.id)}" title="تعديل الاسم" aria-label="تعديل اسم ${escapeHtml(player.name)}"><svg><use href="#i-edit"></use></svg></button>${secondaryAction}</div>
          <div class="player-card__stats"><div class="player-mini-stat"><strong>${number(playerStats.played)}</strong><span>مباراة</span></div><div class="player-mini-stat"><strong>${number(playerStats.wins)}</strong><span>فوز</span></div><div class="player-mini-stat"><strong>${number(playerStats.goals)}</strong><span>هدف</span></div><div class="player-mini-stat"><strong>${number(playerStats.points)}</strong><span>نقطة</span></div></div>
        </article>
      `;
    }).join("");
  }

  function renderRanking() {
    const ranking = getRankedPlayers();
    if (!ranking.length) {
      elements.podium.innerHTML = "";
      elements.rankingTable.innerHTML = emptyState("i-trophy", "الترتيب بانتظار النتائج", "سجّل أول مباراة ليظهر ترتيب اللاعبين.", "تسجيل مباراة", "match");
      return;
    }

    const podiumOrder = ranking.slice(0, 3);
    elements.podium.innerHTML = podiumOrder.map((entry, index) => {
      const place = index + 1;
      return `<article class="podium-place podium-place--${place}"><span class="podium-medal">${number(place)}</span>${playerAvatar(entry.player)}<strong>${escapeHtml(entry.player.name)}</strong><b>${getMetricDisplay(entry)}</b><small>${getMetricLabel()}</small></article>`;
    }).join("");

    elements.rankingTable.innerHTML = `
      <div class="ranking-header"><span>#</span><span>اللاعب</span><span>لعب</span><span>فاز</span><span>أهداف</span><span>${rankingMetric === "winRate" ? "النسبة" : "النقاط"}</span></div>
      ${ranking.map((entry, index) => `
        <div class="ranking-row">
          <span class="ranking-rank">${number(index + 1)}</span>
          <div class="ranking-player">${playerAvatar(entry.player)}<strong>${escapeHtml(entry.player.name)}</strong></div>
          <span class="ranking-value">${number(entry.played)}</span>
          <span class="ranking-value">${number(entry.wins)}</span>
          <span class="ranking-value">${number(entry.goals)}</span>
          <span class="ranking-value is-main">${rankingMetric === "winRate" ? `${number(entry.winRate, 0)}٪` : number(entry.points)}</span>
        </div>
      `).join("")}
    `;
  }

  function getHeadToHeadData(firstId, secondId) {
    const firstPlayer = getPlayer(firstId);
    const secondPlayer = getPlayer(secondId);
    const matches = sortMatches(state.matches.filter((match) =>
      (match.playerOneId === firstId && match.playerTwoId === secondId) ||
      (match.playerOneId === secondId && match.playerTwoId === firstId)
    ));
    let firstWins = 0;
    let secondWins = 0;
    let draws = 0;
    let firstGoals = 0;
    let secondGoals = 0;

    matches.forEach((match) => {
      const firstIsPlayerOne = match.playerOneId === firstId;
      const goalsFirst = firstIsPlayerOne ? match.scoreOne : match.scoreTwo;
      const goalsSecond = firstIsPlayerOne ? match.scoreTwo : match.scoreOne;
      firstGoals += goalsFirst;
      secondGoals += goalsSecond;
      if (goalsFirst > goalsSecond) firstWins += 1;
      else if (goalsSecond > goalsFirst) secondWins += 1;
      else draws += 1;
    });

    return { firstPlayer, secondPlayer, matches, firstWins, secondWins, draws, firstGoals, secondGoals };
  }

  function populateHeadToHeadSelects() {
    const players = [...state.players].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const previousFirst = elements.h2hPlayerOne.value;
    const previousSecond = elements.h2hPlayerTwo.value;
    const options = players.map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join("");
    const placeholder = players.length ? "" : '<option value="">لا يوجد لاعبون</option>';
    elements.h2hPlayerOne.innerHTML = placeholder + options;
    elements.h2hPlayerTwo.innerHTML = placeholder + options;
    elements.h2hPlayerOne.value = players.some((player) => player.id === previousFirst) ? previousFirst : (players[0]?.id || "");
    elements.h2hPlayerTwo.value = players.some((player) => player.id === previousSecond) && previousSecond !== elements.h2hPlayerOne.value
      ? previousSecond
      : (players.find((player) => player.id !== elements.h2hPlayerOne.value)?.id || "");
    elements.h2hPlayerOne.disabled = players.length < 2;
    elements.h2hPlayerTwo.disabled = players.length < 2;
  }

  function renderHeadToHead() {
    const firstId = elements.h2hPlayerOne.value;
    const secondId = elements.h2hPlayerTwo.value;
    if (!firstId || !secondId || firstId === secondId) {
      elements.headToHeadReport.innerHTML = emptyState("i-users", "اختر لاعبين", "يجب وجود لاعبين على الأقل لعرض المواجهات المباشرة.", "إضافة لاعب", "add-player");
      return;
    }

    const data = getHeadToHeadData(firstId, secondId);
    const history = data.matches.length
      ? `<h3 class="h2h-history-title">سجل المباريات (${number(data.matches.length)})</h3><div class="matches-list">${data.matches.map((match) => renderMatchCard(match, false)).join("")}</div>`
      : emptyState("i-ball", "لا توجد مواجهة بينهما بعد", "سجّل أول مباراة بين اللاعبين لبدء المقارنة.", "تسجيل مباراة", "match");

    elements.headToHeadReport.innerHTML = `
      <section class="h2h-scorecard">
        <div class="h2h-scoreline">
          <div class="h2h-side">${playerAvatar(data.firstPlayer)}<strong>${escapeHtml(data.firstPlayer.name)}</strong><b>${number(data.firstWins)}</b><small>انتصار</small></div>
          <div class="h2h-center"><strong>${number(data.firstGoals)} : ${number(data.secondGoals)}</strong><span>إجمالي الأهداف</span></div>
          <div class="h2h-side">${playerAvatar(data.secondPlayer)}<strong>${escapeHtml(data.secondPlayer.name)}</strong><b>${number(data.secondWins)}</b><small>انتصار</small></div>
        </div>
        <div class="h2h-summary"><div><strong>${number(data.matches.length)}</strong><span>مباراة</span></div><div><strong>${number(data.draws)}</strong><span>تعادل</span></div><div><strong>${number(Math.abs(data.firstGoals - data.secondGoals))}</strong><span>فارق الأهداف</span></div></div>
        <div class="h2h-actions"><button class="icon-text-button" type="button" data-share-report="headtohead"><svg><use href="#i-share"></use></svg> مشاركة المواجهة كصورة</button></div>
      </section>
      ${history}
    `;
  }

  function getRecords() {
    const stats = [...getStatsMap().values()].filter((entry) => entry.played > 0);
    const topGoals = [...stats].sort((a, b) => b.goals - a.goals || b.played - a.played)[0];
    const topWins = [...stats].sort((a, b) => b.wins - a.wins || b.played - a.played)[0];
    const qualified = stats.filter((entry) => entry.played >= 3);
    const bestRate = [...(qualified.length ? qualified : stats)].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0];
    const biggestWin = [...state.matches].sort((a, b) => Math.abs(b.scoreOne - b.scoreTwo) - Math.abs(a.scoreOne - a.scoreTwo) || (b.scoreOne + b.scoreTwo) - (a.scoreOne + a.scoreTwo))[0];
    const highestScoring = [...state.matches].sort((a, b) => (b.scoreOne + b.scoreTwo) - (a.scoreOne + a.scoreTwo))[0];
    const rivalryMap = new Map();
    state.matches.forEach((match) => {
      const key = [match.playerOneId, match.playerTwoId].sort().join("|");
      if (!rivalryMap.has(key)) rivalryMap.set(key, { ids: key.split("|"), count: 0 });
      rivalryMap.get(key).count += 1;
    });
    const rivalry = [...rivalryMap.values()].sort((a, b) => b.count - a.count)[0];

    return { stats, topGoals, topWins, bestRate, biggestWin, highestScoring, rivalry };
  }

  function recordCard(label, title, detail, icon = "i-trophy") {
    return `<article class="record-card"><span class="record-card__icon"><svg><use href="#${icon}"></use></svg></span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></article>`;
  }

  function getRecentMonths(count = 6) {
    const now = new Date();
    const months = [];
    for (let index = count - 1; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const month = date.getMonth();
      const year = date.getFullYear();
      const matches = state.matches.filter((match) => {
        const played = new Date(match.playedAt);
        return played.getMonth() === month && played.getFullYear() === year;
      }).length;
      months.push({ label: new Intl.DateTimeFormat("ar-SA", { month: "short" }).format(date), matches });
    }
    return months;
  }

  function renderRecords() {
    if (!state.matches.length) {
      elements.recordsGrid.innerHTML = emptyState("i-chart", "لا توجد أرقام بعد", "ابدأ بتسجيل المباريات لتظهر إنجازات الموسم.", "تسجيل مباراة", "match");
      elements.activityReport.innerHTML = "";
      return;
    }

    const records = getRecords();
    const biggestFirst = records.biggestWin ? getPlayer(records.biggestWin.playerOneId) : null;
    const biggestSecond = records.biggestWin ? getPlayer(records.biggestWin.playerTwoId) : null;
    const scoringFirst = records.highestScoring ? getPlayer(records.highestScoring.playerOneId) : null;
    const scoringSecond = records.highestScoring ? getPlayer(records.highestScoring.playerTwoId) : null;
    const rivalryFirst = records.rivalry ? getPlayer(records.rivalry.ids[0]) : null;
    const rivalrySecond = records.rivalry ? getPlayer(records.rivalry.ids[1]) : null;

    elements.recordsGrid.innerHTML = [
      recordCard("هداف الموسم", records.topGoals?.player.name || "—", records.topGoals ? `${number(records.topGoals.goals)} هدف` : "—", "i-ball"),
      recordCard("الأكثر فوزًا", records.topWins?.player.name || "—", records.topWins ? `${number(records.topWins.wins)} فوز من ${number(records.topWins.played)}` : "—", "i-trophy"),
      recordCard("أفضل نسبة فوز", records.bestRate?.player.name || "—", records.bestRate ? `${number(records.bestRate.winRate, 1)}٪ خلال ${number(records.bestRate.played)} مباراة` : "—", "i-chart"),
      recordCard("أكبر فارق", biggestFirst && biggestSecond ? `${biggestFirst.name} × ${biggestSecond.name}` : "—", records.biggestWin ? `${number(records.biggestWin.scoreOne)} : ${number(records.biggestWin.scoreTwo)}` : "—", "i-chart"),
      recordCard("أكثر مباراة تهديفًا", scoringFirst && scoringSecond ? `${scoringFirst.name} × ${scoringSecond.name}` : "—", records.highestScoring ? `${number(records.highestScoring.scoreOne + records.highestScoring.scoreTwo)} أهداف` : "—", "i-ball"),
      recordCard("أكثر مواجهة تكرارًا", rivalryFirst && rivalrySecond ? `${rivalryFirst.name} × ${rivalrySecond.name}` : "—", records.rivalry ? `${number(records.rivalry.count)} مباراة` : "—", "i-users")
    ].join("");

    const months = getRecentMonths();
    const max = Math.max(1, ...months.map((month) => month.matches));
    elements.activityReport.innerHTML = `<h2>نشاط آخر ٦ أشهر</h2><p>عدد المباريات المسجلة في كل شهر.</p><div class="activity-bars">${months.map((month) => `<div class="activity-bar"><strong>${number(month.matches)}</strong><div class="activity-bar__track"><span class="activity-bar__fill" style="height:${Math.max(4, (month.matches / max) * 100)}%"></span></div><span>${escapeHtml(month.label)}</span></div>`).join("")}</div>`;
  }

  function renderDataSummary() {
    const bytes = new Blob([JSON.stringify(state)]).size;
    elements.dataSummary.innerHTML = `<span>${number(state.players.length)} لاعب</span><span>${number(state.matches.length)} مباراة</span><span>${number(bytes / 1024, 1)} ك.ب</span>`;
  }

  function renderReports() {
    populateHeadToHeadSelects();
    renderRanking();
    renderHeadToHead();
    renderRecords();
  }

  function renderAll() {
    renderOverview();
    renderRecentMatches();
    populatePlayerSelects();
    renderPlayers();
    renderReports();
    renderDataSummary();
  }

  function formatSyncTime(value) {
    if (!isValidDate(value)) return "لم تتم المزامنة بعد";
    return `آخر مزامنة: ${formatDate(value)}، ${formatTime(value)}`;
  }

  function renderCloudMembers(members = []) {
    if (!members.length) {
      elements.cloudMembersList.innerHTML = `<div class="members-empty">لم تضف مستخدمين بعد. أضف بريدًا وحدد الصلاحية.</div>`;
      return;
    }
    elements.cloudMembersList.innerHTML = members.map((member) => `
      <div class="member-row">
        <div class="member-row__identity"><strong>${escapeHtml(member.email)}</strong><small>أضيف في ${escapeHtml(formatDate(member.createdAt))}</small></div>
        <select data-member-role="${escapeHtml(member.email)}" aria-label="صلاحية ${escapeHtml(member.email)}">
          <option value="viewer"${member.role === "viewer" ? " selected" : ""}>مشاهدة فقط</option>
          <option value="editor"${member.role === "editor" ? " selected" : ""}>مشاهدة وتعديل</option>
        </select>
        <button class="member-remove" type="button" data-remove-member="${escapeHtml(member.email)}" aria-label="إلغاء وصول ${escapeHtml(member.email)}"><svg><use href="#i-trash"></use></svg></button>
      </div>`).join("");
  }

  function applyMutationAccess(readOnly) {
    document.body.classList.toggle("is-readonly", readOnly);
    elements.readOnlyBanner.hidden = !readOnly;
    const controls = [
      ...$$("input, select, button", elements.matchForm),
      $("#heroAddPlayer"),
      $("#matchAddPlayer"),
      $("#addPlayerButton"),
      elements.importData,
      $("#resetData")
    ].filter(Boolean);
    controls.forEach((control) => { control.disabled = readOnly; });
    if (readOnly && elements.playerDialog.open) elements.playerDialog.close();
  }

  function renderCloudUi(snapshot = cloud?.snapshot()) {
    const current = snapshot || { configured: false, authenticated: false, status: "local" };
    const labels = {
      local: "محلي",
      ready: "جاهز",
      pending: "بانتظار الحفظ",
      syncing: "جارٍ الحفظ",
      synced: "محفوظ سحابيًا",
      error: "تعذر الحفظ",
      offline: "دون اتصال"
    };
    const status = Object.hasOwn(labels, current.status) ? current.status : "local";
    elements.cloudStatusButton.className = `sync-pill is-${status}`;
    elements.cloudStatusText.textContent = labels[status];
    elements.cloudStatusButton.title = current.statusDetail || labels[status];
    elements.cloudStatusButton.setAttribute("aria-label", `حالة الحفظ: ${labels[status]}`);

    elements.cloudAccountBadge.className = "cloud-badge";
    const activeWorkspace = current.activeWorkspace;
    const roleLabels = { owner: "مالك", editor: "محرر", viewer: "مشاهد" };
    const readOnly = Boolean(current.authenticated && current.canWrite === false);
    if (current.authenticated) {
      elements.cloudAccountBadge.textContent = "متصل";
      elements.cloudAccountBadge.classList.add("is-connected");
      elements.cloudDescription.textContent = readOnly
        ? "تعرض الآن نتائج مشتركة بصلاحية المشاهدة فقط؛ التقارير والمشاركة متاحة دون تعديل البيانات."
        : current.statusDetail || "تتم مزامنة اللاعبين والمباريات تلقائيًا، مع استمرار الحفظ المحلي دون إنترنت.";
    } else if (status === "error") {
      elements.cloudAccountBadge.textContent = "تحتاج مراجعة";
      elements.cloudAccountBadge.classList.add("is-error");
      elements.cloudDescription.textContent = current.statusDetail || "تعذر الاتصال بالحفظ السحابي.";
    } else if (current.configured) {
      elements.cloudAccountBadge.textContent = "جاهز للربط";
      elements.cloudDescription.textContent = "تم حفظ اتصال Supabase على هذا الجهاز. سجّل الدخول لبدء المزامنة.";
    } else {
      elements.cloudAccountBadge.textContent = "اختياري";
      elements.cloudDescription.textContent = "اربط حسابًا مجانيًا لحفظ بياناتك على الإنترنت واستعادتها على أي جهاز، مع استمرار العمل دون إنترنت.";
    }

    elements.cloudAccount.hidden = !current.authenticated;
    elements.cloudAccountEmail.textContent = current.user?.email || "حساب Supabase";
    elements.cloudLastSync.textContent = formatSyncTime(current.lastSyncedAt);
    elements.cloudWorkspacePanel.hidden = !current.authenticated;
    elements.cloudWorkspace.innerHTML = (current.workspaces || []).map((workspace) => `<option value="${escapeHtml(workspace.ownerId)}">${escapeHtml(workspace.label)} — ${roleLabels[workspace.role] || "مشترك"}</option>`).join("");
    elements.cloudWorkspace.value = activeWorkspace?.ownerId || "";
    elements.cloudWorkspace.disabled = !current.authenticated || (current.workspaces || []).length < 2 || status === "syncing";
    elements.cloudWorkspaceRole.textContent = roleLabels[activeWorkspace?.role] || "محلي";
    elements.cloudWorkspaceRole.className = `workspace-role${activeWorkspace?.role === "viewer" ? " is-viewer" : ""}`;
    elements.cloudPrimaryAction.hidden = current.authenticated;
    elements.cloudPrimaryAction.innerHTML = `<svg><use href="#${current.configured ? "i-login" : "i-cloud"}"></use></svg> ${current.configured ? "تسجيل الدخول" : "بدء الإعداد"}`;
    elements.cloudSyncNow.hidden = !current.authenticated;
    elements.cloudSignOut.hidden = !current.authenticated;
    elements.cloudReadonlyNotice.hidden = !readOnly;
    elements.cloudMembersPanel.hidden = !current.isOwner;
    elements.readOnlyBannerText.textContent = `أنت تعرض نتائج ${activeWorkspace?.ownerEmail || "مشتركة"} بصلاحية المشاهدة فقط.`;
    renderCloudMembers(current.isOwner ? current.members : []);
    applyMutationAccess(readOnly);
  }

  function setCloudAuthMode(mode) {
    cloudAuthMode = mode === "signup" ? "signup" : "login";
    $$('[data-auth-mode]').forEach((button) => {
      const active = button.dataset.authMode === cloudAuthMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    elements.cloudPassword.autocomplete = cloudAuthMode === "signup" ? "new-password" : "current-password";
    elements.cloudAuthSubmit.textContent = cloudAuthMode === "signup" ? "إنشاء الحساب والمزامنة" : "تسجيل الدخول والمزامنة";
    hideFormMessage(elements.cloudAuthMessage);
  }

  function showCloudPanel(panel) {
    const setup = panel === "setup";
    elements.cloudSetupPanel.hidden = !setup;
    elements.cloudAuthPanel.hidden = setup;
    if (setup) {
      const config = cloud?.snapshot().config;
      elements.supabaseUrl.value = config?.supabaseUrl || "";
      elements.supabaseAnonKey.value = config?.supabaseAnonKey || "";
      hideFormMessage(elements.cloudConfigMessage);
      window.setTimeout(() => elements.supabaseUrl.focus(), 80);
    } else {
      setCloudAuthMode("login");
      window.setTimeout(() => elements.cloudEmail.focus(), 80);
    }
  }

  function openCloudDialog(forceSetup = false) {
    if (!cloud) {
      toast("تعذر تحميل وحدة الحفظ السحابي.", "error");
      return;
    }
    showCloudPanel(forceSetup || !cloud.snapshot().configured ? "setup" : "auth");
    if (!elements.cloudDialog.open) elements.cloudDialog.showModal();
  }

  function saveCloudConfig(event) {
    event.preventDefault();
    hideFormMessage(elements.cloudConfigMessage);
    try {
      cloud.saveConfig(elements.supabaseUrl.value, elements.supabaseAnonKey.value);
      showCloudPanel("auth");
      toast("تم حفظ اتصال Supabase على هذا الجهاز.");
    } catch (error) {
      showFormMessage(elements.cloudConfigMessage, error.message);
    }
  }

  async function submitCloudAuth(event) {
    event.preventDefault();
    const email = elements.cloudEmail.value.trim();
    const password = elements.cloudPassword.value;
    hideFormMessage(elements.cloudAuthMessage);
    if (!elements.cloudEmail.checkValidity()) {
      showFormMessage(elements.cloudAuthMessage, "أدخل بريدًا إلكترونيًا صحيحًا.");
      return;
    }
    if (password.length < 6) {
      showFormMessage(elements.cloudAuthMessage, "اكتب كلمة مرور من ٦ أحرف على الأقل.");
      return;
    }

    elements.cloudAuthSubmit.disabled = true;
    elements.cloudAuthSubmit.setAttribute("aria-busy", "true");
    try {
      const result = cloudAuthMode === "signup" ? await cloud.signUp(email, password) : await cloud.signIn(email, password);
      if (result.confirmationRequired) {
        setCloudAuthMode("login");
        elements.cloudEmail.value = email;
        showFormMessage(elements.cloudAuthMessage, "تم إنشاء الحساب. افتح رسالة التأكيد في بريدك، ثم عد وسجّل الدخول.");
      } else {
        elements.cloudPassword.value = "";
        elements.cloudDialog.close();
        toast("تم تسجيل الدخول وتفعيل المزامنة.");
      }
    } catch (error) {
      showFormMessage(elements.cloudAuthMessage, error.message);
    } finally {
      elements.cloudAuthSubmit.disabled = false;
      elements.cloudAuthSubmit.removeAttribute("aria-busy");
      renderCloudUi();
    }
  }

  async function syncCloudNow() {
    if (!cloud?.snapshot().authenticated) {
      openCloudDialog(!cloud?.snapshot().configured);
      return;
    }
    elements.cloudSyncNow.disabled = true;
    try {
      await cloud.refreshWorkspaces();
      const result = await cloud.syncNow();
      if (!result?.offline && result?.direction !== "down") toast("تمت مزامنة البيانات بنجاح.");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      elements.cloudSyncNow.disabled = false;
    }
  }

  async function signOutCloud() {
    try {
      await cloud?.signOut();
      renderCloudUi();
      toast("تم تسجيل الخروج. ستبقى بياناتك الشخصية محفوظة على هذا الجهاز.");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function switchCloudWorkspace() {
    const ownerId = elements.cloudWorkspace.value;
    elements.cloudWorkspace.disabled = true;
    try {
      await cloud.selectWorkspace(ownerId);
      renderAll();
      renderCloudUi();
      toast("تم تبديل مساحة النتائج.");
    } catch (error) {
      renderCloudUi();
      toast(error.message, "error");
    }
  }

  async function addCloudMember(event) {
    event.preventDefault();
    hideFormMessage(elements.cloudMemberMessage);
    elements.cloudMemberSubmit.disabled = true;
    try {
      await cloud.addMember(elements.cloudMemberEmail.value, elements.cloudMemberRole.value);
      elements.cloudMemberEmail.value = "";
      elements.cloudMemberRole.value = "viewer";
      renderCloudUi();
      toast("تمت إضافة المستخدم. أرسل له رابط التطبيق ليدخل بنفس البريد.");
    } catch (error) {
      showFormMessage(elements.cloudMemberMessage, error.message);
    } finally {
      elements.cloudMemberSubmit.disabled = false;
    }
  }

  async function updateCloudMember(select) {
    select.disabled = true;
    try {
      await cloud.updateMember(select.dataset.memberRole, select.value);
      renderCloudUi();
      toast("تم تحديث صلاحية المستخدم فورًا.");
    } catch (error) {
      renderCloudUi();
      toast(error.message, "error");
    }
  }

  async function removeCloudMember(email) {
    const confirmed = await askConfirm({
      title: "إلغاء وصول المستخدم؟",
      text: `لن يتمكن ${email} من فتح هذه النتائج بعد الآن.`,
      confirmText: "إلغاء الوصول"
    });
    if (!confirmed) return;
    try {
      await cloud.removeMember(email);
      renderCloudUi();
      toast("تم إلغاء وصول المستخدم.");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function ensureCanModify() {
    const snapshot = cloud?.snapshot();
    if (snapshot?.authenticated && snapshot.canWrite === false) {
      toast("هذه النتائج للعرض فقط. اطلب من المالك صلاحية التعديل.", "error");
      return false;
    }
    return true;
  }

  function showFormMessage(element, text) {
    element.textContent = text;
    element.hidden = false;
  }

  function hideFormMessage(element) {
    element.hidden = true;
    element.textContent = "";
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast ${type === "error" ? "is-error" : ""}`;
    item.innerHTML = `<svg><use href="#${type === "error" ? "i-info" : "i-check"}"></use></svg><span>${escapeHtml(message)}</span>`;
    elements.toastRegion.appendChild(item);
    window.setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(8px)";
      window.setTimeout(() => item.remove(), 220);
    }, 3200);
  }

  function showView() {
    const allowed = ["home", "match", "players", "reports", "settings"];
    const requested = location.hash.replace("#", "") || "home";
    const view = allowed.includes(requested) ? requested : "home";
    $$(".view").forEach((section) => section.classList.toggle("is-active", section.dataset.view === view));
    $$("[data-nav]").forEach((link) => {
      const active = link.dataset.nav === view;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (view === "reports") renderReports();
    if (view === "players") renderPlayers();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPlayerDialog(playerId = "") {
    if (!ensureCanModify()) return;
    const player = playerId ? getPlayer(playerId) : null;
    elements.editingPlayerId.value = player?.id || "";
    elements.playerName.value = player?.name || "";
    elements.playerDialogTitle.textContent = player ? "تعديل اسم اللاعب" : "إضافة لاعب جديد";
    hideFormMessage(elements.playerFormMessage);
    if (!elements.playerDialog.open) elements.playerDialog.showModal();
    window.setTimeout(() => elements.playerName.focus(), 80);
  }

  async function askConfirm({ title, text, confirmText = "تأكيد", danger = true }) {
    elements.confirmTitle.textContent = title;
    elements.confirmText.textContent = text;
    elements.confirmAction.textContent = confirmText;
    elements.confirmAction.className = `button ${danger ? "button--danger" : "button--primary"}`;
    if (!elements.confirmDialog.open) elements.confirmDialog.showModal();
    return new Promise((resolve) => {
      elements.confirmDialog.addEventListener("close", () => resolve(elements.confirmDialog.returnValue === "confirm"), { once: true });
    });
  }

  function addOrUpdatePlayer(event) {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!ensureCanModify()) return;
    const name = elements.playerName.value.trim().replace(/\s+/g, " ");
    const editingId = elements.editingPlayerId.value;
    if (name.length < 2) {
      showFormMessage(elements.playerFormMessage, "اكتب اسم اللاعب من حرفين على الأقل.");
      return;
    }
    const duplicate = state.players.find((player) => player.id !== editingId && player.name.toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar"));
    if (duplicate) {
      showFormMessage(elements.playerFormMessage, "هذا اللاعب موجود بالفعل في القائمة.");
      return;
    }

    if (editingId) {
      const player = getPlayer(editingId);
      if (!player) return;
      player.name = name;
      toast("تم تحديث اسم اللاعب.");
    } else {
      state.players.push({
        id: makeId("player"),
        name,
        joinedAt: new Date().toISOString(),
        color: PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
        active: true
      });
      toast("تمت إضافة اللاعب إلى القائمة.");
    }
    saveState();
    elements.playerDialog.close();
    renderAll();
  }

  async function handlePlayerAction(button) {
    if (!ensureCanModify()) return;
    const player = getPlayer(button.dataset.playerId);
    if (!player) return;
    const action = button.dataset.playerAction;
    if (action === "edit") {
      openPlayerDialog(player.id);
      return;
    }
    if (action === "toggle") {
      player.active = !player.active;
      saveState();
      renderAll();
      toast(player.active ? "تمت إعادة تنشيط اللاعب." : "تمت أرشفة اللاعب مع الاحتفاظ بنتائجه.");
      return;
    }
    if (action === "delete") {
      const confirmed = await askConfirm({
        title: "حذف اللاعب؟",
        text: `سيتم حذف ${player.name} من القائمة. لا يمكن التراجع عن ذلك.`,
        confirmText: "حذف اللاعب"
      });
      if (!confirmed) return;
      state.players = state.players.filter((item) => item.id !== player.id);
      saveState();
      renderAll();
      toast("تم حذف اللاعب.");
    }
  }

  function validatePlayerPair(firstSelect, secondSelect, changedSelect) {
    if (!firstSelect.value || !secondSelect.value || firstSelect.value !== secondSelect.value) return;
    const options = [...secondSelect.options].filter((option) => option.value && option.value !== changedSelect.value);
    if (changedSelect === firstSelect) secondSelect.value = options[0]?.value || "";
    else firstSelect.value = [...firstSelect.options].find((option) => option.value && option.value !== changedSelect.value)?.value || "";
  }

  function saveMatch(event) {
    event.preventDefault();
    if (!ensureCanModify()) return;
    const firstId = elements.playerOne.value;
    const secondId = elements.playerTwo.value;
    const firstScore = Number.parseInt(elements.scoreOne.value, 10);
    const secondScore = Number.parseInt(elements.scoreTwo.value, 10);
    const playedAt = new Date(elements.playedAt.value);

    if (!firstId || !secondId) {
      showFormMessage(elements.matchFormMessage, "اختر لاعبين لتسجيل المباراة.");
      return;
    }
    if (firstId === secondId) {
      showFormMessage(elements.matchFormMessage, "يجب اختيار لاعبين مختلفين.");
      return;
    }
    if (!Number.isInteger(firstScore) || !Number.isInteger(secondScore) || firstScore < 0 || secondScore < 0 || firstScore > 99 || secondScore > 99) {
      showFormMessage(elements.matchFormMessage, "أدخل نتيجة صحيحة بين ٠ و٩٩ لكل لاعب.");
      return;
    }
    if (Number.isNaN(playedAt.getTime())) {
      showFormMessage(elements.matchFormMessage, "حدد تاريخ ووقت المباراة.");
      return;
    }

    state.matches.push({
      id: makeId("match"),
      playerOneId: firstId,
      playerTwoId: secondId,
      scoreOne: firstScore,
      scoreTwo: secondScore,
      playedAt: playedAt.toISOString(),
      createdAt: new Date().toISOString(),
      note: elements.matchNote.value.trim().slice(0, 80)
    });
    saveState();
    elements.scoreOne.value = "0";
    elements.scoreTwo.value = "0";
    elements.matchNote.value = "";
    elements.playedAt.value = toLocalInputValue();
    hideFormMessage(elements.matchFormMessage);
    renderAll();
    toast("حُفظت النتيجة واحتُسبت الإحصائيات.");
    location.hash = "home";
  }

  async function deleteMatch(matchId) {
    if (!ensureCanModify()) return;
    const match = state.matches.find((item) => item.id === matchId);
    if (!match) return;
    const first = getPlayer(match.playerOneId);
    const second = getPlayer(match.playerTwoId);
    const confirmed = await askConfirm({
      title: "حذف المباراة؟",
      text: `سيتم حذف نتيجة ${first?.name || "اللاعب الأول"} و${second?.name || "اللاعب الثاني"} وإعادة احتساب جميع التقارير.`,
      confirmText: "حذف النتيجة"
    });
    if (!confirmed) return;
    state.matches = state.matches.filter((item) => item.id !== matchId);
    saveState();
    renderAll();
    toast("تم حذف المباراة وتحديث الإحصائيات.");
  }

  function switchReportTab(tab) {
    activeReportTab = tab;
    $$("[data-report-tab]").forEach((button) => {
      const active = button.dataset.reportTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$("[data-report-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.reportPanel === tab));
  }

  function setRankingMetric(metric) {
    rankingMetric = metric;
    $$("[data-metric]").forEach((button) => button.classList.toggle("is-active", button.dataset.metric === metric));
    renderRanking();
  }

  function exportBackup() {
    const payload = {
      application: "سجل الملاعب",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `football-score-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast("تم تنزيل النسخة الاحتياطية.");
  }

  async function importBackup(file) {
    if (!file) return;
    if (!ensureCanModify()) {
      elements.importData.value = "";
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.data || parsed;
      if (!incoming || !Array.isArray(incoming.players) || !Array.isArray(incoming.matches)) throw new Error("invalid backup");
      const normalized = normalizeState(incoming);
      const confirmed = await askConfirm({
        title: "استعادة النسخة؟",
        text: `تحتوي النسخة على ${normalized.players.length} لاعب و${normalized.matches.length} مباراة. ستستبدل البيانات الحالية.`,
        confirmText: "استعادة",
        danger: false
      });
      if (!confirmed) return;
      state = normalized;
      saveState();
      renderAll();
      toast("تمت استعادة البيانات بنجاح.");
    } catch (error) {
      console.warn("Invalid backup", error);
      toast("الملف غير صالح أو لا يخص هذا التطبيق.", "error");
    } finally {
      elements.importData.value = "";
    }
  }

  async function resetAllData() {
    if (!ensureCanModify()) return;
    const confirmed = await askConfirm({
      title: "مسح جميع البيانات؟",
      text: "سيتم حذف كل اللاعبين والمباريات، وستنتقل عملية الحذف إلى حسابك السحابي عند المزامنة. نزّل نسخة احتياطية أولاً إن كنت تحتاجها.",
      confirmText: "مسح كل البيانات"
    });
    if (!confirmed) return;
    state = createInitialState();
    saveState();
    elements.playerSearch.value = "";
    renderAll();
    toast("تمت إعادة ضبط التطبيق.");
    location.hash = "home";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getShareReport(type) {
    const totalGoals = state.matches.reduce((sum, match) => sum + match.scoreOne + match.scoreTwo, 0);
    const generated = `آخر تحديث: ${formatDate(new Date().toISOString())}`;

    if (type === "headtohead") {
      const data = getHeadToHeadData(elements.h2hPlayerOne.value, elements.h2hPlayerTwo.value);
      if (!data.firstPlayer || !data.secondPlayer) return null;
      return {
        title: `${data.firstPlayer.name} × ${data.secondPlayer.name}`,
        subtitle: "تقرير المواجهات المباشرة",
        accent: `${number(data.firstWins)} فوز  •  ${number(data.draws)} تعادل  •  ${number(data.secondWins)} فوز`,
        stats: [
          { label: "المباريات", value: data.matches.length },
          { label: "إجمالي الأهداف", value: `${data.firstGoals} : ${data.secondGoals}` },
          { label: "التعادلات", value: data.draws }
        ],
        rows: data.matches.slice(0, 7).map((match) => {
          const first = getPlayer(match.playerOneId);
          const second = getPlayer(match.playerTwoId);
          return { label: `${first?.name || "—"} × ${second?.name || "—"}`, meta: formatDate(match.playedAt), value: `${match.scoreOne} : ${match.scoreTwo}` };
        }),
        empty: "لا توجد مباريات مسجلة بينهما.",
        footer: generated
      };
    }

    if (type === "records") {
      const records = getRecords();
      const rows = [];
      if (records.topGoals) rows.push({ label: "هداف الموسم", meta: records.topGoals.player.name, value: `${records.topGoals.goals} هدف` });
      if (records.topWins) rows.push({ label: "الأكثر فوزًا", meta: records.topWins.player.name, value: `${records.topWins.wins} فوز` });
      if (records.bestRate) rows.push({ label: "أفضل نسبة فوز", meta: records.bestRate.player.name, value: `${records.bestRate.winRate.toFixed(1)}٪` });
      if (records.highestScoring) {
        const first = getPlayer(records.highestScoring.playerOneId);
        const second = getPlayer(records.highestScoring.playerTwoId);
        rows.push({ label: "أكثر مباراة تهديفًا", meta: `${first?.name || "—"} × ${second?.name || "—"}`, value: `${records.highestScoring.scoreOne} : ${records.highestScoring.scoreTwo}` });
      }
      return {
        title: "أرقام الموسم",
        subtitle: "أبرز الإنجازات المسجلة",
        accent: `${number(state.matches.length)} مباراة • ${number(totalGoals)} هدف`,
        stats: [
          { label: "اللاعبون", value: state.players.length },
          { label: "المباريات", value: state.matches.length },
          { label: "الأهداف", value: totalGoals }
        ],
        rows,
        empty: "سجّل بعض المباريات لتظهر أرقام الموسم.",
        footer: generated
      };
    }

    const metric = type === "ranking" ? rankingMetric : "points";
    const ranking = getRankedPlayers(metric);
    return {
      title: type === "ranking" ? "ترتيب اللاعبين" : "ملخص الموسم",
      subtitle: type === "ranking" ? `الترتيب حسب ${getMetricLabel(metric)}` : "سجل الملاعب",
      accent: `${number(state.players.length)} لاعب • ${number(state.matches.length)} مباراة • ${number(totalGoals)} هدف`,
      stats: [
        { label: "اللاعبون", value: state.players.length },
        { label: "المباريات", value: state.matches.length },
        { label: "الأهداف", value: totalGoals }
      ],
      rows: ranking.slice(0, 8).map((entry, index) => ({
        rank: index + 1,
        label: entry.player.name,
        meta: `${entry.played} مباراة • ${entry.wins} فوز • ${entry.goals} هدف`,
        value: metric === "winRate" ? `${entry.winRate.toFixed(1)}٪` : `${entry[metric]} ${getMetricLabel(metric)}`
      })),
      empty: "سجّل أول مباراة ليظهر ترتيب اللاعبين.",
      footer: generated
    };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fitCanvasText(ctx, value, maxWidth, startSize, weight = 700) {
    let size = startSize;
    const text = String(value || "—");
    while (size > 24) {
      ctx.font = `${weight} ${size}px Tahoma, Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 2;
    }
    return { text, size };
  }

  function drawReport(report) {
    const canvas = elements.reportCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.direction = "rtl";

    ctx.fillStyle = "#f2f5f0";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#0c2b24";
    ctx.fillRect(0, 0, width, 370);

    ctx.globalAlpha = .11;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(42, 38, width - 84, 292);
    ctx.beginPath();
    ctx.arc(width / 2, 184, 85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width / 2, 38);
    ctx.lineTo(width / 2, 330);
    ctx.stroke();
    ctx.globalAlpha = 1;

    roundedRect(ctx, 74, 66, 88, 88, 26);
    ctx.fillStyle = "#d8ff53";
    ctx.fill();
    ctx.fillStyle = "#0c2b24";
    ctx.textAlign = "center";
    ctx.font = "900 34px Arial, sans-serif";
    ctx.fillText("⚽", 118, 124);

    ctx.textAlign = "right";
    ctx.fillStyle = "#d8ff53";
    ctx.font = "700 26px Tahoma, Arial, sans-serif";
    ctx.fillText(report.subtitle, 970, 98);
    const fittedTitle = fitCanvasText(ctx, report.title, 760, 58, 900);
    ctx.font = `900 ${fittedTitle.size}px Tahoma, Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(fittedTitle.text, 970, 170);
    ctx.fillStyle = "#bdcec7";
    ctx.font = "700 24px Tahoma, Arial, sans-serif";
    ctx.fillText(report.accent, 970, 218);

    roundedRect(ctx, 60, 286, 960, 984, 40);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#dce5df";
    ctx.lineWidth = 2;
    ctx.stroke();

    const stats = report.stats || [];
    const statsWidth = 870 / Math.max(1, stats.length);
    stats.forEach((stat, index) => {
      const right = 945 - index * statsWidth;
      ctx.textAlign = "right";
      ctx.fillStyle = "#6f7d77";
      ctx.font = "700 21px Tahoma, Arial, sans-serif";
      ctx.fillText(String(stat.label), right, 360);
      ctx.fillStyle = "#116348";
      ctx.font = "900 42px Tahoma, Arial, sans-serif";
      ctx.fillText(String(stat.value), right, 411);
      if (index < stats.length - 1) {
        ctx.beginPath();
        ctx.moveTo(right - statsWidth + 22, 326);
        ctx.lineTo(right - statsWidth + 22, 425);
        ctx.strokeStyle = "#e4ebe6";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    ctx.beginPath();
    ctx.moveTo(105, 458);
    ctx.lineTo(975, 458);
    ctx.strokeStyle = "#dde5df";
    ctx.stroke();

    const rows = (report.rows || []).slice(0, 8);
    if (!rows.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#6f7d77";
      ctx.font = "700 29px Tahoma, Arial, sans-serif";
      ctx.fillText(report.empty || "لا توجد بيانات بعد.", width / 2, 730);
    } else {
      rows.forEach((row, index) => {
        const y = 520 + index * 91;
        if (row.rank) {
          ctx.beginPath();
          ctx.arc(940, y + 17, 26, 0, Math.PI * 2);
          ctx.fillStyle = index === 0 ? "#d8ff53" : "#e9efea";
          ctx.fill();
          ctx.fillStyle = "#0c2b24";
          ctx.textAlign = "center";
          ctx.font = "900 21px Arial, sans-serif";
          ctx.fillText(String(row.rank), 940, y + 25);
        }

        ctx.textAlign = "right";
        const labelFit = fitCanvasText(ctx, row.label, row.rank ? 565 : 640, 30, 800);
        ctx.font = `800 ${labelFit.size}px Tahoma, Arial, sans-serif`;
        ctx.fillStyle = "#10221b";
        ctx.fillText(labelFit.text, row.rank ? 890 : 940, y + 9);
        ctx.font = "500 20px Tahoma, Arial, sans-serif";
        ctx.fillStyle = "#7b8882";
        ctx.fillText(String(row.meta || ""), row.rank ? 890 : 940, y + 43);

        ctx.textAlign = "left";
        ctx.fillStyle = "#116348";
        ctx.font = "900 27px Tahoma, Arial, sans-serif";
        ctx.fillText(String(row.value || ""), 120, y + 25);

        if (index < rows.length - 1) {
          ctx.beginPath();
          ctx.moveTo(110, y + 69);
          ctx.lineTo(970, y + 69);
          ctx.strokeStyle = "#edf1ee";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "#0c2b24";
    ctx.font = "900 28px Tahoma, Arial, sans-serif";
    ctx.fillText("سجل الملاعب", 970, 1315);
    ctx.textAlign = "left";
    ctx.fillStyle = "#6f7d77";
    ctx.font = "600 20px Tahoma, Arial, sans-serif";
    ctx.fillText(report.footer, 90, 1315);
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas export failed")), "image/png", .96);
    });
  }

  async function shareReport(type, trigger) {
    const report = getShareReport(type);
    if (!report) {
      toast("اختر التقرير المطلوب أولاً.", "error");
      return;
    }
    if (trigger) {
      trigger.disabled = true;
      trigger.setAttribute("aria-busy", "true");
    }
    try {
      const canvas = drawReport(report);
      const blob = await canvasToBlob(canvas);
      const filename = `football-report-${type}-${new Date().toISOString().slice(0, 10)}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: report.title,
          text: `${report.subtitle} — من تطبيق سجل الملاعب`,
          files: [file]
        });
        toast("تم فتح خيارات المشاركة؛ اختر واتساب.");
      } else {
        downloadBlob(blob, filename);
        toast("تم تنزيل صورة التقرير. يمكنك إرفاقها في واتساب.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Report share failed", error);
        toast("تعذرت مشاركة التقرير. حاول مرة أخرى.", "error");
      }
    } finally {
      if (trigger) {
        trigger.disabled = false;
        trigger.removeAttribute("aria-busy");
      }
    }
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  async function requestInstall() {
    if (isStandalone()) {
      toast("التطبيق مثبت بالفعل على هذا الجهاز.");
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    elements.installInstructions.innerHTML = isiOS
      ? `<div class="install-step"><b>١</b><span>افتح الصفحة في متصفح Safari.</span></div><div class="install-step"><b>٢</b><span>اضغط زر المشاركة أسفل الشاشة.</span></div><div class="install-step"><b>٣</b><span>اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».</span></div>`
      : `<div class="install-step"><b>١</b><span>افتح قائمة المتصفح ⋮.</span></div><div class="install-step"><b>٢</b><span>اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</span></div><div class="install-step"><b>٣</b><span>وافق على التثبيت وسيظهر التطبيق مع تطبيقاتك.</span></div>`;
    if (!elements.installDialog.open) elements.installDialog.showModal();
  }

  function updateOnlineStatus() {
    elements.offlineBadge.hidden = navigator.onLine;
  }

  function bindEvents() {
    window.addEventListener("hashchange", showView);
    window.addEventListener("online", () => {
      updateOnlineStatus();
      cloud?.handleOnline();
    });
    window.addEventListener("offline", () => {
      updateOnlineStatus();
      cloud?.handleOffline();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        state = loadState();
        renderAll();
        toast("تم تحديث البيانات من نافذة أخرى.");
      }
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      elements.installQuickButton.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      elements.installQuickButton.hidden = true;
      toast("تم تثبيت سجل الملاعب بنجاح.");
    });

    elements.playerForm.addEventListener("submit", addOrUpdatePlayer);
    elements.matchForm.addEventListener("submit", saveMatch);
    elements.playerSearch.addEventListener("input", renderPlayers);
    elements.importData.addEventListener("change", () => importBackup(elements.importData.files?.[0]));
    elements.cloudConfigForm.addEventListener("submit", saveCloudConfig);
    elements.cloudAuthForm.addEventListener("submit", submitCloudAuth);
    elements.cloudMemberForm.addEventListener("submit", addCloudMember);
    elements.cloudWorkspace.addEventListener("change", switchCloudWorkspace);
    elements.cloudMembersList.addEventListener("change", (event) => {
      const roleSelect = event.target.closest("[data-member-role]");
      if (roleSelect) updateCloudMember(roleSelect);
    });
    elements.cloudDialogClose.addEventListener("click", () => elements.cloudDialog.close());
    elements.cloudBackToConfig.addEventListener("click", () => showCloudPanel("setup"));
    elements.cloudPrimaryAction.addEventListener("click", () => openCloudDialog(!cloud?.snapshot().configured));
    elements.cloudConfigure.addEventListener("click", () => openCloudDialog(true));
    elements.cloudSyncNow.addEventListener("click", syncCloudNow);
    elements.cloudSignOut.addEventListener("click", signOutCloud);
    elements.cloudStatusButton.addEventListener("click", () => {
      location.hash = "settings";
      if (!cloud?.snapshot().authenticated) openCloudDialog(!cloud?.snapshot().configured);
    });
    $$('[data-auth-mode]').forEach((button) => button.addEventListener("click", () => setCloudAuthMode(button.dataset.authMode)));
    elements.playerOne.addEventListener("change", () => validatePlayerPair(elements.playerOne, elements.playerTwo, elements.playerOne));
    elements.playerTwo.addEventListener("change", () => validatePlayerPair(elements.playerOne, elements.playerTwo, elements.playerTwo));
    elements.h2hPlayerOne.addEventListener("change", () => {
      validatePlayerPair(elements.h2hPlayerOne, elements.h2hPlayerTwo, elements.h2hPlayerOne);
      renderHeadToHead();
    });
    elements.h2hPlayerTwo.addEventListener("change", () => {
      validatePlayerPair(elements.h2hPlayerOne, elements.h2hPlayerTwo, elements.h2hPlayerTwo);
      renderHeadToHead();
    });

    $("#swapPlayers").addEventListener("click", () => {
      [elements.playerOne.value, elements.playerTwo.value] = [elements.playerTwo.value, elements.playerOne.value];
      [elements.scoreOne.value, elements.scoreTwo.value] = [elements.scoreTwo.value, elements.scoreOne.value];
    });

    $$(".score-step").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.scoreTarget);
        input.value = String(Math.min(99, Math.max(0, clampScore(input.value) + Number(button.dataset.delta))));
      });
    });

    [$("#heroAddPlayer"), $("#matchAddPlayer"), $("#addPlayerButton")].forEach((button) => button.addEventListener("click", () => openPlayerDialog()));
    [elements.installQuickButton, elements.installSettingsButton].forEach((button) => button.addEventListener("click", requestInstall));
    $("#exportData").addEventListener("click", exportBackup);
    $("#resetData").addEventListener("click", resetAllData);

    document.addEventListener("click", (event) => {
      const emptyAction = event.target.closest("[data-empty-action]");
      if (emptyAction) {
        if (emptyAction.dataset.emptyAction === "add-player") openPlayerDialog();
        else location.hash = emptyAction.dataset.emptyAction;
        return;
      }
      const playerAction = event.target.closest("[data-player-action]");
      if (playerAction) {
        handlePlayerAction(playerAction);
        return;
      }
      const deleteButton = event.target.closest("[data-delete-match]");
      if (deleteButton) {
        deleteMatch(deleteButton.dataset.deleteMatch);
        return;
      }
      const removeMemberButton = event.target.closest("[data-remove-member]");
      if (removeMemberButton) {
        removeCloudMember(removeMemberButton.dataset.removeMember);
        return;
      }
      const reportTab = event.target.closest("[data-report-tab]");
      if (reportTab) {
        switchReportTab(reportTab.dataset.reportTab);
        return;
      }
      const metricButton = event.target.closest("[data-metric]");
      if (metricButton) {
        setRankingMetric(metricButton.dataset.metric);
        return;
      }
      const filterButton = event.target.closest("[data-player-filter]");
      if (filterButton) {
        playerFilter = filterButton.dataset.playerFilter;
        $$("[data-player-filter]").forEach((button) => button.classList.toggle("is-active", button === filterButton));
        renderPlayers();
        return;
      }
      const shareButton = event.target.closest("[data-share-report]");
      if (shareButton) shareReport(shareButton.dataset.shareReport, shareButton);
    });
  }

  function init() {
    elements.playedAt.value = toLocalInputValue();
    elements.todayLabel.textContent = new Intl.DateTimeFormat(ARABIC_LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    bindEvents();
    renderAll();
    switchReportTab(activeReportTab);
    updateOnlineStatus();
    renderCloudUi();
    showView();

    cloud?.initialize();

    if (isStandalone()) elements.installQuickButton.hidden = true;
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("service-worker.js").catch((error) => console.warn("Service worker registration failed", error));
    }
  }

  init();
})();
