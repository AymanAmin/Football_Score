/*
 * Public browser configuration for optional Supabase sync.
 * The publishable/anon key is safe to expose only when RLS is enabled.
 * Never place a service_role key or any secret key in this file.
 */
window.FOOTBALL_CLOUD_CONFIG = Object.freeze({
  supabaseUrl: "https://tseniigzftrxvqaspnnp.supabase.co",
  supabaseAnonKey: "sb_publishable_GbJUUPSnPeuat9w7VLJQZA_JHwRYnAi"
});

/*
 * Public results directory + global administrator extension.
 * Security is enforced again in Supabase RLS; the checks here only improve the UI.
 */
(() => {
  "use strict";

  const ADMIN_EMAIL = "ayman1793@gmail.com";
  const TABLE_NAME = "football_app_data";
  const MEMBERS_TABLE = "football_app_members";
  const UI_ID = "publicResultsPanel";
  let assignedApi;

  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function isAdminSession(instance) {
    return normalizeEmail(instance?.session?.user?.email) === ADMIN_EMAIL;
  }

  function roleLabel(workspace, isAdmin) {
    if (workspace?.role === "owner") return "مالك";
    if (workspace?.role === "editor") return "محرر";
    if (workspace?.role === "admin" || isAdmin) return "مسؤول";
    if (workspace?.access === "public") return "عرض عام";
    return "مشاهد";
  }

  function installStyles() {
    if (document.getElementById("publicResultsStyles")) return;
    const style = document.createElement("style");
    style.id = "publicResultsStyles";
    style.textContent = `
      .public-results-panel{margin-top:18px;padding:18px;border:1px solid var(--border,#dce5df);border-radius:20px;background:linear-gradient(145deg,#f8fbf9,#eef5f1)}
      .public-results-panel[hidden]{display:none!important}
      .public-results-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
      .public-results-heading h3{margin:2px 0 4px;font-size:18px}
      .public-results-heading p{margin:0;color:var(--muted,#68766f);font-size:13px;line-height:1.7}
      .public-results-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:#0c2b24;color:#d8ff53;flex:none}
      .public-results-icon svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8}
      .public-search-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}
      .public-search-form .field{margin:0}
      .public-search-form button{min-height:44px}
      .public-search-note{display:flex;gap:8px;align-items:flex-start;margin:11px 0 0;color:var(--muted,#68766f);font-size:12px;line-height:1.65}
      .public-search-note svg{width:16px;height:16px;flex:none;margin-top:2px;fill:none;stroke:currentColor;stroke-width:1.8}
      .public-search-message{margin-top:12px;padding:10px 12px;border-radius:12px;background:#fff;color:#52615a;font-size:13px}
      .public-search-message.is-error{background:#fff0f0;color:#9f2f2f}
      .public-results-list{display:grid;gap:9px;margin-top:12px}
      .public-result-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:#fff;border:1px solid #e0e8e3;border-radius:15px}
      .public-result-identity{min-width:0;display:grid;gap:3px}
      .public-result-identity strong{overflow-wrap:anywhere;font-size:14px;direction:ltr;text-align:right}
      .public-result-identity small{color:#738079;font-size:12px}
      .public-result-actions{display:flex;align-items:center;gap:8px;flex:none}
      .public-role-badge{padding:5px 8px;border-radius:999px;background:#edf4f0;color:#245d49;font-size:11px;font-weight:800;white-space:nowrap}
      .public-role-badge.is-admin{background:#fff2c2;color:#795e00}
      .public-open-button{border:0;border-radius:11px;padding:9px 12px;background:#12674c;color:#fff;font:inherit;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
      .public-open-button:disabled{opacity:.55;cursor:wait}
      .admin-access-banner{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 12px;border-radius:13px;background:#fff7d7;color:#6d5500;font-size:12px;font-weight:700}
      .admin-access-banner svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8}
      body.is-admin-account #cloudAccountBadge{background:#fff2c2;color:#6d5500}
      body.is-admin-account #cloudWorkspaceRole{background:#fff2c2;color:#6d5500}
      @media(max-width:620px){
        .public-search-form{grid-template-columns:1fr}
        .public-result-row{align-items:flex-start;flex-direction:column}
        .public-result-actions{width:100%;justify-content:space-between}
        .public-open-button{flex:1}
      }
    `;
    document.head.appendChild(style);
  }

  function createSearchUi(instance) {
    if (document.getElementById(UI_ID)) return document.getElementById(UI_ID);
    const workspacePanel = document.getElementById("cloudWorkspacePanel");
    if (!workspacePanel) return null;

    installStyles();
    const panel = document.createElement("section");
    panel.id = UI_ID;
    panel.className = "public-results-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div id="adminAccessBanner" class="admin-access-banner" hidden>
        <svg><use href="#i-shield"></use></svg>
        <span>أنت مسجل بحساب المسؤول العام، ويمكنك تعديل جميع النتائج وإدارة صلاحياتها.</span>
      </div>
      <div class="public-results-heading">
        <div><span class="section-kicker">النتائج العامة</span><h3>البحث عن نتائج الآخرين</h3><p>ابحث بالبريد الإلكتروني وافتح النتائج مباشرة للعرض فقط، دون الحاجة إلى دعوة.</p></div>
        <span class="public-results-icon"><svg><use href="#i-search"></use></svg></span>
      </div>
      <form id="publicResultsSearchForm" class="public-search-form" novalidate>
        <label class="field field--stack" for="publicResultsSearch"><span>بريد صاحب النتائج</span><input id="publicResultsSearch" type="search" inputmode="email" autocomplete="off" dir="ltr" placeholder="name@example.com" minlength="2"></label>
        <button class="button button--primary" id="publicResultsSearchButton" type="submit"><svg><use href="#i-search"></use></svg> بحث</button>
      </form>
      <div class="public-search-note"><svg><use href="#i-eye"></use></svg><span>فتح النتائج من البحث يمنح المشاهدة فقط. التعديل لا يتاح إلا بدعوة «مشاهدة وتعديل» أو لحساب المسؤول العام.</span></div>
      <div id="publicResultsMessage" class="public-search-message" hidden></div>
      <div id="publicResultsList" class="public-results-list"></div>
    `;
    workspacePanel.insertAdjacentElement("afterend", panel);

    const form = panel.querySelector("#publicResultsSearchForm");
    const input = panel.querySelector("#publicResultsSearch");
    const button = panel.querySelector("#publicResultsSearchButton");
    const message = panel.querySelector("#publicResultsMessage");
    const list = panel.querySelector("#publicResultsList");
    const resultMap = new Map();

    const showMessage = (text, type = "") => {
      message.textContent = text || "";
      message.classList.toggle("is-error", type === "error");
      message.hidden = !text;
    };

    const renderResults = (rows) => {
      resultMap.clear();
      list.innerHTML = "";
      if (!rows.length) {
        showMessage("لم يتم العثور على حساب مطابق. تأكد من البريد أو جرّب جزءًا منه.");
        return;
      }
      showMessage(`تم العثور على ${rows.length.toLocaleString("ar-SA")} نتيجة.`);
      list.innerHTML = rows.map((row) => {
        resultMap.set(row.ownerId, row);
        const admin = row.role === "admin";
        return `
          <article class="public-result-row">
            <div class="public-result-identity"><strong>${escapeHtml(row.ownerEmail || "حساب بدون بريد ظاهر")}</strong><small>${row.updatedAt ? `آخر تحديث: ${escapeHtml(new Date(row.updatedAt).toLocaleString("ar-SA"))}` : "نتائج سحابية"}</small></div>
            <div class="public-result-actions"><span class="public-role-badge${admin ? " is-admin" : ""}">${escapeHtml(roleLabel(row, admin))}</span><button class="public-open-button" type="button" data-open-public-workspace="${escapeHtml(row.ownerId)}">فتح النتائج</button></div>
          </article>`;
      }).join("");
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = input.value.trim();
      const admin = isAdminSession(instance);
      if (!admin && query.length < 2) {
        showMessage("اكتب حرفين على الأقل من البريد الإلكتروني.", "error");
        input.focus();
        return;
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      showMessage("جارٍ البحث...");
      list.innerHTML = "";
      try {
        const rows = await instance.searchPublicWorkspaces(query);
        renderResults(rows);
      } catch (error) {
        showMessage(error.message || "تعذر البحث في النتائج.", "error");
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    });

    list.addEventListener("click", async (event) => {
      const openButton = event.target.closest("[data-open-public-workspace]");
      if (!openButton) return;
      const workspace = resultMap.get(openButton.dataset.openPublicWorkspace);
      if (!workspace) return;
      openButton.disabled = true;
      try {
        await instance.openPublicWorkspace(workspace);
        instance.onMessage?.(`تم فتح نتائج ${workspace.ownerEmail}.`, "success");
        location.hash = "home";
      } catch (error) {
        showMessage(error.message || "تعذر فتح النتائج.", "error");
      } finally {
        openButton.disabled = false;
      }
    });

    return panel;
  }

  function updateExtendedUi(instance, snapshot) {
    const current = snapshot || instance.snapshot();
    const panel = createSearchUi(instance);
    if (!panel) return;
    const admin = Boolean(current.isAdmin);
    const active = current.activeWorkspace;
    panel.hidden = !current.authenticated;
    panel.querySelector("#adminAccessBanner").hidden = !admin;
    document.body.classList.toggle("is-admin-account", admin);

    const badge = document.getElementById("cloudAccountBadge");
    if (admin && current.authenticated && badge) badge.textContent = "مسؤول عام";

    const description = document.getElementById("cloudDescription");
    if (admin && description) description.textContent = "يمكن لحساب المسؤول العام فتح جميع مساحات النتائج وتعديلها وإدارة المستخدمين المشاركين.";

    const roleElement = document.getElementById("cloudWorkspaceRole");
    if (roleElement && active) roleElement.textContent = roleLabel(active, admin && active.role === "admin");

    const selector = document.getElementById("cloudWorkspace");
    if (selector) {
      [...selector.options].forEach((option) => {
        const workspace = (current.workspaces || []).find((item) => item.ownerId === option.value);
        if (workspace) option.textContent = `${workspace.label} — ${roleLabel(workspace, admin && workspace.role === "admin")}`;
      });
    }

    const readonlyNotice = document.querySelector("#cloudReadonlyNotice span");
    if (readonlyNotice && active?.access === "public") readonlyNotice.textContent = "فتحت هذه النتائج من البحث العام؛ يمكنك الاطلاع والتقارير فقط. اطلب دعوة تعديل من المالك عند الحاجة.";

    const bannerText = document.getElementById("readOnlyBannerText");
    if (bannerText && active?.access === "public") bannerText.textContent = `أنت تعرض نتائج ${active.ownerEmail || "عامة"} من البحث العام بصلاحية المشاهدة فقط.`;

    const membersHeading = document.querySelector("#cloudMembersPanel .members-panel__heading h3");
    if (membersHeading) membersHeading.textContent = active?.role === "admin" ? "إدارة مستخدمي هذه النتائج" : "المستخدمون المشاركون";
  }

  function patchInstance(instance) {
    if (!instance || instance.__publicResultsAdminPatched) return instance;
    instance.__publicResultsAdminPatched = true;

    const originalSnapshot = instance.snapshot.bind(instance);
    const originalSelectWorkspace = instance.selectWorkspace.bind(instance);
    const originalValidateMember = instance.validateMember.bind(instance);

    instance.isAdmin = () => isAdminSession(instance);

    instance.snapshot = () => {
      const base = originalSnapshot();
      const active = base.activeWorkspace;
      const admin = isAdminSession(instance);
      return {
        ...base,
        isAdmin: admin,
        canWrite: !base.authenticated || ["owner", "editor", "admin"].includes(active?.role),
        isOwner: Boolean(base.authenticated && ["owner", "admin"].includes(active?.role))
      };
    };

    instance.canWrite = () => ["owner", "editor", "admin"].includes(instance.getActiveWorkspace()?.role);

    instance.assertOwnerWorkspace = () => {
      if (!["owner", "admin"].includes(instance.getActiveWorkspace()?.role)) {
        throw new Error("إدارة المستخدمين متاحة لمالك النتائج أو المسؤول العام فقط.");
      }
    };

    instance.refreshWorkspaces = async ({ notify = true } = {}) => {
      if (!instance.session?.user?.id) return [];
      const userId = instance.session.user.id;
      const email = normalizeEmail(instance.session.user.email);
      const requested = instance.activeOwnerId;
      const admin = isAdminSession(instance);

      const [sharedRows, ownMemberRows] = await Promise.all([
        instance.dataRequest(`${MEMBERS_TABLE}?member_email=eq.${encodeURIComponent(email)}&select=owner_id,owner_email,role,created_at&order=created_at.asc`),
        instance.dataRequest(`${MEMBERS_TABLE}?owner_id=eq.${encodeURIComponent(userId)}&select=member_email,role,created_at,updated_at&order=created_at.asc`)
      ]);

      const workspaceMap = new Map();
      workspaceMap.set(userId, { ownerId: userId, ownerEmail: email, role: "owner", label: "نتائجي" });

      (Array.isArray(sharedRows) ? sharedRows : []).forEach((row) => {
        if (!row?.owner_id || !["viewer", "editor"].includes(row.role)) return;
        workspaceMap.set(row.owner_id, {
          ownerId: row.owner_id,
          ownerEmail: normalizeEmail(row.owner_email) || "مالك المساحة",
          role: row.role,
          label: `نتائج ${normalizeEmail(row.owner_email) || "مشتركة"}`,
          access: "invitation"
        });
      });

      if (admin) {
        const allRows = await instance.dataRequest(`${TABLE_NAME}?select=owner_id,owner_email,updated_at&order=owner_email.asc&limit=500`);
        (Array.isArray(allRows) ? allRows : []).forEach((row) => {
          if (!row?.owner_id || row.owner_id === userId) return;
          workspaceMap.set(row.owner_id, {
            ownerId: row.owner_id,
            ownerEmail: normalizeEmail(row.owner_email) || "مالك المساحة",
            role: "admin",
            label: `نتائج ${normalizeEmail(row.owner_email) || row.owner_id}`,
            access: "admin",
            updatedAt: row.updated_at
          });
        });
      } else if (requested && !workspaceMap.has(requested)) {
        try {
          const rows = await instance.dataRequest(`${TABLE_NAME}?owner_id=eq.${encodeURIComponent(requested)}&select=owner_id,owner_email,updated_at&limit=1`);
          const row = Array.isArray(rows) ? rows[0] : null;
          if (row?.owner_id) {
            workspaceMap.set(row.owner_id, {
              ownerId: row.owner_id,
              ownerEmail: normalizeEmail(row.owner_email) || "مالك المساحة",
              role: "viewer",
              label: `نتائج ${normalizeEmail(row.owner_email) || "عامة"}`,
              access: "public",
              updatedAt: row.updated_at
            });
          }
        } catch {
          // If public access was removed, fall back to the personal workspace below.
        }
      }

      instance.workspaces = [...workspaceMap.values()];
      const next = workspaceMap.get(requested) || workspaceMap.get(userId) || instance.workspaces[0];
      if (requested && next && requested !== next.ownerId) {
        await instance.onWorkspaceChange(next, { ownerId: requested, role: "viewer", access: "public" });
      }
      instance.activeOwnerId = next?.ownerId || userId;
      localStorage.setItem("footballScoreActiveWorkspace.v1", instance.activeOwnerId);

      const active = instance.getActiveWorkspace();
      if (["owner", "admin"].includes(active?.role)) {
        const rows = active.ownerId === userId
          ? ownMemberRows
          : await instance.dataRequest(`${MEMBERS_TABLE}?owner_id=eq.${encodeURIComponent(active.ownerId)}&select=member_email,role,created_at,updated_at&order=created_at.asc`);
        instance.members = (Array.isArray(rows) ? rows : []).map((row) => ({
          email: row.member_email,
          role: row.role,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
      } else {
        instance.members = [];
      }

      if (notify) instance.emitAuth();
      return instance.workspaces;
    };

    instance.searchPublicWorkspaces = async (query) => {
      if (!instance.session?.user?.id) throw new Error("سجّل الدخول أولاً للبحث عن نتائج الآخرين.");
      const clean = String(query || "").trim().toLowerCase().replace(/[,%()]/g, "").slice(0, 120);
      if (!isAdminSession(instance) && clean.length < 2) throw new Error("اكتب حرفين على الأقل من البريد الإلكتروني.");
      const filter = clean ? `owner_email=ilike.${encodeURIComponent(`*${clean}*`)}&` : "";
      const rows = await instance.dataRequest(`${TABLE_NAME}?${filter}select=owner_id,owner_email,updated_at&order=owner_email.asc&limit=${isAdminSession(instance) ? 100 : 25}`);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.owner_id && row?.owner_email)
        .map((row) => {
          const existing = instance.workspaces.find((workspace) => workspace.ownerId === row.owner_id);
          const role = existing?.role || (isAdminSession(instance) ? "admin" : "viewer");
          return {
            ownerId: row.owner_id,
            ownerEmail: normalizeEmail(row.owner_email),
            role,
            label: existing?.label || `نتائج ${normalizeEmail(row.owner_email)}`,
            access: existing?.access || (role === "admin" ? "admin" : "public"),
            updatedAt: row.updated_at
          };
        });
    };

    instance.openPublicWorkspace = async (workspace) => {
      if (!workspace?.ownerId) throw new Error("تعذر تحديد مساحة النتائج.");
      let target = instance.workspaces.find((item) => item.ownerId === workspace.ownerId);
      if (!target) {
        target = {
          ownerId: workspace.ownerId,
          ownerEmail: normalizeEmail(workspace.ownerEmail) || "مالك المساحة",
          role: isAdminSession(instance) ? "admin" : "viewer",
          label: workspace.label || `نتائج ${normalizeEmail(workspace.ownerEmail) || "عامة"}`,
          access: isAdminSession(instance) ? "admin" : "public",
          updatedAt: workspace.updatedAt
        };
        instance.workspaces.push(target);
        instance.emitAuth();
      }
      return originalSelectWorkspace(target.ownerId);
    };

    instance.pushState = async () => {
      if (!instance.canWrite()) throw new Error("هذه المساحة للعرض فقط. اطلب من المالك منحك صلاحية التعديل.");
      const current = instance.getState();
      const active = instance.getActiveWorkspace();
      const ownerId = active?.ownerId || instance.session.user.id;
      const ownerEmail = normalizeEmail(active?.ownerEmail) || normalizeEmail(instance.session.user.email);
      await instance.dataRequest(`${TABLE_NAME}?on_conflict=owner_id`, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          owner_id: ownerId,
          owner_email: ownerEmail,
          data: current,
          updated_at: current.updatedAt || new Date().toISOString()
        }
      });
      instance.lastSyncedAt = new Date().toISOString();
      instance.emitStatus("synced", "تم الحفظ في السحابة");
    };

    instance.addMember = async (email, role) => {
      instance.assertOwnerWorkspace();
      const memberEmail = originalValidateMember(email, role);
      const active = instance.getActiveWorkspace();
      await instance.dataRequest(`${MEMBERS_TABLE}?on_conflict=owner_id,member_email`, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          owner_id: active.ownerId,
          owner_email: normalizeEmail(active.ownerEmail),
          member_email: memberEmail,
          role,
          updated_at: new Date().toISOString()
        }
      });
      await instance.refreshWorkspaces();
      return instance.members.find((member) => member.email === memberEmail);
    };

    instance.updateMember = async (email, role) => {
      instance.assertOwnerWorkspace();
      const memberEmail = originalValidateMember(email, role);
      const active = instance.getActiveWorkspace();
      await instance.dataRequest(`${MEMBERS_TABLE}?owner_id=eq.${encodeURIComponent(active.ownerId)}&member_email=eq.${encodeURIComponent(memberEmail)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { owner_email: normalizeEmail(active.ownerEmail), role, updated_at: new Date().toISOString() }
      });
      await instance.refreshWorkspaces();
    };

    instance.removeMember = async (email) => {
      instance.assertOwnerWorkspace();
      const memberEmail = normalizeEmail(email);
      const active = instance.getActiveWorkspace();
      await instance.dataRequest(`${MEMBERS_TABLE}?owner_id=eq.${encodeURIComponent(active.ownerId)}&member_email=eq.${encodeURIComponent(memberEmail)}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
      await instance.refreshWorkspaces();
    };

    const statusCallback = instance.onStatus;
    const authCallback = instance.onAuthChange;
    instance.onStatus = (snapshot) => {
      const enhanced = instance.snapshot();
      statusCallback?.(enhanced);
      queueMicrotask(() => updateExtendedUi(instance, enhanced));
    };
    instance.onAuthChange = (snapshot) => {
      const enhanced = instance.snapshot();
      authCallback?.(enhanced);
      queueMicrotask(() => updateExtendedUi(instance, enhanced));
    };

    queueMicrotask(() => updateExtendedUi(instance, instance.snapshot()));
    return instance;
  }

  function patchApi(api) {
    if (!api?.create || api.__publicResultsAdminPatched) return api;
    api.__publicResultsAdminPatched = true;
    const originalCreate = api.create.bind(api);
    api.create = (options) => {
      const instance = patchInstance(originalCreate(options));
      api.instance = instance;
      return instance;
    };
    return api;
  }

  Object.defineProperty(window, "FootballCloud", {
    configurable: true,
    get() {
      return assignedApi;
    },
    set(value) {
      assignedApi = patchApi(value);
      Object.defineProperty(window, "FootballCloud", {
        configurable: true,
        writable: true,
        value: assignedApi
      });
    }
  });
})();
