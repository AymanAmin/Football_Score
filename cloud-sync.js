(() => {
  "use strict";

  const CONFIG_KEY = "footballScoreCloudConfig.v1";
  const SESSION_KEY = "footballScoreCloudSession.v1";
  const ACTIVE_WORKSPACE_KEY = "footballScoreActiveWorkspace.v1";
  const TABLE_NAME = "football_app_data";
  const MEMBERS_TABLE = "football_app_members";

  class CloudSyncError extends Error {
    constructor(message, status = 0, code = "") {
      super(message);
      this.name = "CloudSyncError";
      this.status = status;
      this.code = code;
    }
  }

  function readJson(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function decodeJwtRole(key) {
    try {
      const segment = String(key).split(".")[1];
      if (!segment) return "";
      const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      return JSON.parse(atob(padded)).role || "";
    } catch {
      return "";
    }
  }

  function validateConfig(url, key) {
    const supabaseUrl = normalizeUrl(url);
    const supabaseAnonKey = String(key || "").trim();
    let parsed;
    try {
      parsed = new URL(supabaseUrl);
    } catch {
      throw new CloudSyncError("رابط مشروع Supabase غير صحيح.");
    }
    if (parsed.protocol !== "https:") throw new CloudSyncError("يجب أن يبدأ رابط Supabase بـ https://");
    if (supabaseAnonKey.length < 20) throw new CloudSyncError("مفتاح Publishable / anon غير صحيح.");
    if (supabaseAnonKey.startsWith("sb_secret_") || decodeJwtRole(supabaseAnonKey) === "service_role") {
      throw new CloudSyncError("لا تستخدم المفتاح السري أو service_role داخل المتصفح. استخدم Publishable / anon فقط.");
    }
    return { supabaseUrl, supabaseAnonKey };
  }

  function friendlyError(payload, status) {
    const raw = String(payload?.msg || payload?.message || payload?.error_description || payload?.error || "");
    const normalized = raw.toLowerCase();
    if (normalized.includes("invalid login credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    if (normalized.includes("email not confirmed")) return "فعّل بريدك الإلكتروني أولاً، ثم حاول تسجيل الدخول.";
    if (normalized.includes("already registered") || normalized.includes("user already exists")) return "هذا البريد مسجل مسبقًا. استخدم تسجيل الدخول.";
    if (normalized.includes("password") && normalized.includes("characters")) return "كلمة المرور أقصر من الحد المطلوب في إعدادات Supabase.";
    if (normalized.includes("row-level security") || status === 403) return "لا تملك صلاحية تنفيذ هذا التغيير.";
    if (payload?.code === "42P01") return "جداول الحفظ والمشاركة غير موجودة. شغّل أحدث ملف SQL المرفق في Supabase.";
    if (status === 401) return "انتهت جلسة الحفظ السحابي. سجّل الدخول مرة أخرى.";
    if (status === 404) return "جداول الحفظ والمشاركة غير موجودة. شغّل أحدث ملف SQL المرفق في Supabase.";
    return raw || "تعذر الاتصال بالحفظ السحابي.";
  }

  class CloudSync {
    constructor(options = {}) {
      this.getState = options.getState || (() => ({}));
      this.hasLocalState = options.hasLocalState || (() => true);
      this.applyState = options.applyState || (() => {});
      this.onWorkspaceChange = options.onWorkspaceChange || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.onAuthChange = options.onAuthChange || (() => {});
      this.onMessage = options.onMessage || (() => {});
      this.config = this.loadConfig();
      this.session = readJson(SESSION_KEY);
      this.activeOwnerId = localStorage.getItem(ACTIVE_WORKSPACE_KEY) || "";
      this.workspaces = [];
      this.members = [];
      this.status = "local";
      this.statusDetail = "";
      this.lastSyncedAt = null;
      this.syncTimer = null;
      this.syncPromise = null;
    }

    loadConfig() {
      const stored = readJson(CONFIG_KEY);
      const fileConfig = window.FOOTBALL_CLOUD_CONFIG || {};
      const candidate = stored?.supabaseUrl && stored?.supabaseAnonKey ? stored : fileConfig;
      if (!candidate?.supabaseUrl || !candidate?.supabaseAnonKey) return null;
      try {
        return validateConfig(candidate.supabaseUrl, candidate.supabaseAnonKey);
      } catch {
        return null;
      }
    }

    snapshot() {
      const activeWorkspace = this.getActiveWorkspace();
      return {
        configured: Boolean(this.config),
        config: this.config ? { ...this.config } : null,
        authenticated: Boolean(this.session?.accessToken && this.session?.user?.id),
        user: this.session?.user || null,
        workspaces: this.workspaces.map((workspace) => ({ ...workspace })),
        activeWorkspace: activeWorkspace ? { ...activeWorkspace } : null,
        members: this.members.map((member) => ({ ...member })),
        canWrite: !this.session?.user?.id || ["owner", "editor"].includes(activeWorkspace?.role),
        isOwner: Boolean(this.session?.user?.id && activeWorkspace?.role === "owner"),
        status: this.status,
        statusDetail: this.statusDetail,
        lastSyncedAt: this.lastSyncedAt
      };
    }

    getActiveWorkspace() {
      if (!this.session?.user?.id) return null;
      return this.workspaces.find((workspace) => workspace.ownerId === this.activeOwnerId)
        || this.workspaces.find((workspace) => workspace.role === "owner")
        || null;
    }

    canWrite() {
      return ["owner", "editor"].includes(this.getActiveWorkspace()?.role);
    }

    emitStatus(status, detail = "") {
      this.status = status;
      this.statusDetail = detail;
      this.onStatus(this.snapshot());
    }

    emitAuth() {
      this.onAuthChange(this.snapshot());
      this.onStatus(this.snapshot());
    }

    saveConfig(url, key) {
      const next = validateConfig(url, key);
      const changed = !this.config || this.config.supabaseUrl !== next.supabaseUrl || this.config.supabaseAnonKey !== next.supabaseAnonKey;
      this.config = next;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      if (changed) this.clearSession();
      this.emitStatus("ready", "إعداد الاتصال محفوظ");
      this.emitAuth();
      return next;
    }

    removeConfig() {
      localStorage.removeItem(CONFIG_KEY);
      this.config = this.loadConfig();
      this.clearSession();
      this.emitStatus(this.config ? "ready" : "local");
      this.emitAuth();
    }

    clearSession() {
      this.session = null;
      this.activeOwnerId = "";
      this.workspaces = [];
      this.members = [];
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    }

    persistSession(payload) {
      if (!payload?.access_token || !payload?.refresh_token || !payload?.user?.id) {
        throw new CloudSyncError("لم يُرجع Supabase جلسة صالحة.");
      }
      this.session = {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
        user: { id: payload.user.id, email: String(payload.user.email || "").trim().toLowerCase() }
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
      this.emitAuth();
    }

    async parseResponse(response) {
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { message: text };
        }
      }
      if (!response.ok) {
        throw new CloudSyncError(friendlyError(payload, response.status), response.status, payload?.code || payload?.error_code || "");
      }
      return payload;
    }

    baseHeaders() {
      if (!this.config) throw new CloudSyncError("أدخل إعدادات Supabase أولاً.");
      return {
        apikey: this.config.supabaseAnonKey,
        "Content-Type": "application/json"
      };
    }

    async authRequest(path, body) {
      if (!this.config) throw new CloudSyncError("أدخل إعدادات Supabase أولاً.");
      let response;
      try {
        response = await fetch(`${this.config.supabaseUrl}/auth/v1/${path}`, {
          method: "POST",
          headers: this.baseHeaders(),
          body: JSON.stringify(body)
        });
      } catch {
        throw new CloudSyncError("تعذر الوصول إلى Supabase. تحقق من الإنترنت والرابط.");
      }
      return this.parseResponse(response);
    }

    async signIn(email, password) {
      this.emitStatus("syncing", "جارٍ تسجيل الدخول");
      try {
        const payload = await this.authRequest("token?grant_type=password", { email, password });
        this.persistSession(payload);
        await this.refreshWorkspaces({ notify: false });
        await this.syncNow();
        return { confirmationRequired: false, user: this.session.user };
      } catch (error) {
        this.emitStatus("error", error.message);
        throw error;
      }
    }

    async signUp(email, password) {
      this.emitStatus("syncing", "جارٍ إنشاء الحساب");
      try {
        const payload = await this.authRequest("signup", { email, password });
        if (payload?.access_token) {
          this.persistSession(payload);
          await this.refreshWorkspaces({ notify: false });
          await this.syncNow();
          return { confirmationRequired: false, user: this.session.user };
        }
        this.emitStatus("ready", "بانتظار تأكيد البريد");
        return { confirmationRequired: true, user: payload?.user || null };
      } catch (error) {
        this.emitStatus("error", error.message);
        throw error;
      }
    }

    async refreshSession() {
      if (!this.session?.refreshToken) throw new CloudSyncError("سجّل الدخول للحفظ السحابي.", 401);
      try {
        const payload = await this.authRequest("token?grant_type=refresh_token", { refresh_token: this.session.refreshToken });
        this.persistSession(payload);
        return this.session.accessToken;
      } catch (error) {
        this.clearSession();
        this.emitAuth();
        throw error;
      }
    }

    async accessToken() {
      if (!this.session?.accessToken) throw new CloudSyncError("سجّل الدخول للحفظ السحابي.", 401);
      if (this.session.expiresAt > Date.now() + 60000) return this.session.accessToken;
      return this.refreshSession();
    }

    async dataRequest(path, options = {}, retry = true) {
      const token = await this.accessToken();
      let response;
      try {
        response = await fetch(`${this.config.supabaseUrl}/rest/v1/${path}`, {
          method: options.method || "GET",
          headers: {
            ...this.baseHeaders(),
            Authorization: `Bearer ${token}`,
            ...(options.prefer ? { Prefer: options.prefer } : {})
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
      } catch {
        throw new CloudSyncError("تعذر الوصول إلى قاعدة البيانات. ستبقى التغييرات محفوظة على الجهاز.");
      }
      if (response.status === 401 && retry && this.session?.refreshToken) {
        await this.refreshSession();
        return this.dataRequest(path, options, false);
      }
      return this.parseResponse(response);
    }

    async refreshWorkspaces({ notify = true } = {}) {
      if (!this.session?.user?.id) return [];
      const userId = this.session.user.id;
      const email = this.session.user.email;
      const [sharedRows, ownedRows] = await Promise.all([
        this.dataRequest(`${MEMBERS_TABLE}?member_email=eq.${encodeURIComponent(email)}&select=owner_id,owner_email,role,created_at&order=created_at.asc`),
        this.dataRequest(`${MEMBERS_TABLE}?owner_id=eq.${encodeURIComponent(userId)}&select=member_email,role,created_at,updated_at&order=created_at.asc`)
      ]);

      this.workspaces = [{ ownerId: userId, ownerEmail: email, role: "owner", label: "نتائجي" }];
      (Array.isArray(sharedRows) ? sharedRows : []).forEach((row) => {
        if (!row?.owner_id || !["viewer", "editor"].includes(row.role)) return;
        this.workspaces.push({
          ownerId: row.owner_id,
          ownerEmail: row.owner_email || "مالك المساحة",
          role: row.role,
          label: `نتائج ${row.owner_email || "مشتركة"}`
        });
      });
      this.members = (Array.isArray(ownedRows) ? ownedRows : []).map((row) => ({
        email: row.member_email,
        role: row.role,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      const requested = this.activeOwnerId;
      const next = this.workspaces.find((workspace) => workspace.ownerId === requested) || this.workspaces[0];
      if (requested && requested !== next.ownerId) await this.onWorkspaceChange(next, { ownerId: requested, role: "viewer" });
      this.activeOwnerId = next.ownerId;
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, this.activeOwnerId);
      if (notify) this.emitAuth();
      return this.workspaces;
    }

    async selectWorkspace(ownerId) {
      if (!this.session?.user?.id) throw new CloudSyncError("سجّل الدخول أولاً.");
      const next = this.workspaces.find((workspace) => workspace.ownerId === ownerId);
      if (!next) throw new CloudSyncError("لم تعد تملك صلاحية الوصول إلى هذه النتائج.", 403);
      const current = this.getActiveWorkspace();
      if (current?.ownerId === next.ownerId) return this.syncNow();
      if (!navigator.onLine) throw new CloudSyncError("اتصل بالإنترنت للتبديل بين مساحات النتائج.");
      if (this.syncPromise) await this.syncPromise;
      if (current && this.canWrite()) await this.syncNow();
      await this.onWorkspaceChange(next, current);
      this.activeOwnerId = next.ownerId;
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, this.activeOwnerId);
      this.lastSyncedAt = null;
      this.emitAuth();
      return this.syncNow({ forceDownload: true });
    }

    async addMember(email, role) {
      this.assertOwnerWorkspace();
      const memberEmail = this.validateMember(email, role);
      await this.dataRequest(`${MEMBERS_TABLE}?on_conflict=owner_id,member_email`, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          owner_id: this.session.user.id,
          owner_email: this.session.user.email,
          member_email: memberEmail,
          role,
          updated_at: new Date().toISOString()
        }
      });
      await this.refreshWorkspaces();
      return this.members.find((member) => member.email === memberEmail);
    }

    async updateMember(email, role) {
      this.assertOwnerWorkspace();
      const memberEmail = this.validateMember(email, role);
      await this.dataRequest(`${MEMBERS_TABLE}?owner_id=eq.${encodeURIComponent(this.session.user.id)}&member_email=eq.${encodeURIComponent(memberEmail)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { owner_email: this.session.user.email, role, updated_at: new Date().toISOString() }
      });
      await this.refreshWorkspaces();
    }

    async removeMember(email) {
      this.assertOwnerWorkspace();
      const memberEmail = String(email || "").trim().toLowerCase();
      await this.dataRequest(`${MEMBERS_TABLE}?owner_id=eq.${encodeURIComponent(this.session.user.id)}&member_email=eq.${encodeURIComponent(memberEmail)}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
      await this.refreshWorkspaces();
    }

    assertOwnerWorkspace() {
      if (this.getActiveWorkspace()?.role !== "owner") throw new CloudSyncError("إدارة المستخدمين متاحة لمالك النتائج فقط.", 403);
    }

    validateMember(email, role) {
      const memberEmail = String(email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail)) throw new CloudSyncError("أدخل بريدًا إلكترونيًا صحيحًا.");
      if (memberEmail === this.session.user.email) throw new CloudSyncError("لا يمكنك إضافة حسابك ضمن المستخدمين المشاركين.");
      if (!["viewer", "editor"].includes(role)) throw new CloudSyncError("اختر صلاحية صحيحة.");
      return memberEmail;
    }

    async getRemoteRow() {
      const ownerId = encodeURIComponent(this.getActiveWorkspace()?.ownerId || this.session.user.id);
      const rows = await this.dataRequest(`${TABLE_NAME}?owner_id=eq.${ownerId}&select=data,updated_at&limit=1`);
      return Array.isArray(rows) ? rows[0] || null : null;
    }

    async pushState() {
      if (!this.canWrite()) throw new CloudSyncError("هذه المساحة للعرض فقط. اطلب من المالك منحك صلاحية التعديل.", 403);
      const current = this.getState();
      const ownerId = this.getActiveWorkspace()?.ownerId || this.session.user.id;
      await this.dataRequest(`${TABLE_NAME}?on_conflict=owner_id`, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          owner_id: ownerId,
          data: current,
          updated_at: current.updatedAt || new Date().toISOString()
        }
      });
      this.lastSyncedAt = new Date().toISOString();
      this.emitStatus("synced", "تم الحفظ في السحابة");
    }

    async syncNow({ forcePush = false, forceDownload = false } = {}) {
      if (!this.config || !this.session?.user?.id) {
        this.emitStatus(this.config ? "ready" : "local");
        return { skipped: true };
      }
      if (!navigator.onLine) {
        this.emitStatus("offline", "سيتم الحفظ عند عودة الإنترنت");
        return { offline: true };
      }
      if (this.syncPromise) return this.syncPromise;

      this.syncPromise = (async () => {
        this.emitStatus("syncing", "جارٍ مزامنة البيانات");
        try {
          const remote = await this.getRemoteRow();
          const local = this.getState();
          if (forceDownload) {
            await this.applyState(remote?.data || null);
            if (!remote && this.canWrite()) {
              await this.pushState();
              return { direction: "up" };
            }
            this.lastSyncedAt = new Date().toISOString();
            this.emitStatus("synced", remote ? "تم فتح مساحة النتائج" : "لا توجد نتائج في هذه المساحة بعد");
            return { direction: "down" };
          }
          if (!remote && !this.canWrite()) {
            await this.applyState(null);
            this.lastSyncedAt = new Date().toISOString();
            this.emitStatus("synced", "لا توجد نتائج في هذه المساحة بعد");
            return { direction: "down" };
          }
          if (!remote || forcePush) {
            await this.pushState();
            return { direction: "up" };
          }

          const remoteState = remote.data || {};
          const localHasData = Boolean(local.players?.length || local.matches?.length);
          const localWasSaved = Boolean(this.hasLocalState());
          const remoteHasData = Boolean(remoteState.players?.length || remoteState.matches?.length);
          const localTime = Date.parse(local.updatedAt || local.createdAt || "") || 0;
          const remoteTime = Date.parse(remote.updated_at || remoteState.updatedAt || remoteState.createdAt || "") || 0;

          if ((remoteHasData && !localHasData && !localWasSaved) || remoteTime > localTime) {
            await this.applyState(remoteState);
            this.lastSyncedAt = new Date().toISOString();
            this.emitStatus("synced", "تم تنزيل أحدث نسخة");
            return { direction: "down" };
          }

          if (((localHasData && !remoteHasData) || localTime > remoteTime) && this.canWrite()) {
            await this.pushState();
            return { direction: "up" };
          }

          if (localTime > remoteTime && !this.canWrite()) {
            await this.applyState(remoteState);
            this.lastSyncedAt = new Date().toISOString();
            this.emitStatus("synced", "تمت استعادة نسخة المالك للعرض");
            return { direction: "down" };
          }

          this.lastSyncedAt = new Date().toISOString();
          this.emitStatus("synced", "البيانات متطابقة");
          return { direction: "none" };
        } catch (error) {
          this.emitStatus("error", error.message);
          throw error;
        } finally {
          this.syncPromise = null;
        }
      })();
      return this.syncPromise;
    }

    schedulePush() {
      if (!this.config || !this.session?.user?.id) return;
      if (!this.canWrite()) {
        this.emitStatus("synced", "صلاحية العرض فقط");
        return;
      }
      window.clearTimeout(this.syncTimer);
      if (!navigator.onLine) {
        this.emitStatus("offline", "سيتم الحفظ عند عودة الإنترنت");
        return;
      }
      this.emitStatus("pending", "تغييرات بانتظار الحفظ");
      this.syncTimer = window.setTimeout(async () => {
        try {
          if (this.syncPromise) await this.syncPromise;
          await this.syncNow({ forcePush: true });
        } catch {
          // Status callback already reports the failure.
        }
      }, 900);
    }

    async signOut() {
      const current = this.getActiveWorkspace();
      const own = this.workspaces.find((workspace) => workspace.role === "owner");
      if (current && own && current.ownerId !== own.ownerId) {
        await this.onWorkspaceChange(own, current);
        this.activeOwnerId = own.ownerId;
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, own.ownerId);
        if (navigator.onLine) {
          try {
            await this.syncNow({ forceDownload: true });
          } catch {
            // A cached personal copy remains available if loading fails.
          }
        }
      }
      if (this.session?.accessToken && this.config && navigator.onLine) {
        try {
          await fetch(`${this.config.supabaseUrl}/auth/v1/logout`, {
            method: "POST",
            headers: { ...this.baseHeaders(), Authorization: `Bearer ${this.session.accessToken}` }
          });
        } catch {
          // Local sign-out still succeeds when offline.
        }
      }
      this.clearSession();
      this.emitStatus(this.config ? "ready" : "local");
      this.emitAuth();
    }

    async initialize() {
      this.emitAuth();
      if (!this.config) {
        this.emitStatus("local", "الحفظ على الجهاز");
        return;
      }
      if (!this.session?.user?.id) {
        this.emitStatus("ready", "سجّل الدخول لتفعيل المزامنة");
        return;
      }
      try {
        await this.refreshWorkspaces({ notify: false });
        await this.syncNow();
      } catch (error) {
        this.onMessage(error.message, "error");
      }
    }

    async handleOnline() {
      if (!this.config || !this.session?.user?.id) return;
      try {
        await this.refreshWorkspaces({ notify: false });
        await this.syncNow();
      } catch {
        // Status callback already reports the failure.
      }
    }

    handleOffline() {
      if (this.config && this.session?.user?.id) this.emitStatus("offline", "سيتم الحفظ عند عودة الإنترنت");
    }
  }

  window.FootballCloud = {
    create: (options) => new CloudSync(options),
    CloudSyncError
  };
})();
