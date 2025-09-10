// Minimal Vue 3 app using CDN build; services fetch via CORS-friendly endpoints
import {
  createApp,
  reactive,
  computed,
  ref,
} from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { fetchGitHubEvents } from "./services/github.js";
import { fetchSecurityRSS } from "./services/rss.js";
import { fetchLatestCVEs } from "./services/cve.js";
import { fetchCTFTimeEvents } from "./services/ctf.js";
import {
  saveDashboardDataToGist,
  loadDashboardDataFromGist,
} from "./services/gist.js";

const app = {
  setup() {
    const settings = reactive({
      githubUser: "@Hardrivetech".replace(/^@/, ""),
    });

    const auth = reactive({ token: null, loading: false, message: "" });
    const loading = reactive({
      github: false,
      rss: false,
      cve: false,
      ctf: false,
    });
    const github = reactive({ events: [] });
    const savedRssSources = (() => {
      try {
        return JSON.parse(localStorage.getItem("qc.rss.sources") || "null");
      } catch {
        return null;
      }
    })();
    const rss = reactive({
      items: [],
      sources:
        savedRssSources &&
        Array.isArray(savedRssSources) &&
        savedRssSources.length
          ? savedRssSources
          : [
              {
                name: "TheHackerNews",
                url: "https://feeds.feedburner.com/TheHackersNews",
              },
              {
                name: "Krebs on Security",
                url: "https://krebsonsecurity.com/feed/",
              },
              {
                name: "HN Security",
                url: "https://hnrss.org/frontpage?points=150&count=20",
              },
            ],
      newSourceName: "",
      newSourceUrl: "",
      selectedIndex: "",
    });
    const cve = reactive({ items: [] });
    const ctf = reactive({ events: [] });

    // CVE pin/ignore/tags state
    const savedCveState = (() => {
      try {
        return JSON.parse(localStorage.getItem("qc.cve.state") || "null") || {};
      } catch {
        return {};
      }
    })();
    const cveState = reactive({
      pinned: Array.isArray(savedCveState.pinned) ? savedCveState.pinned : [],
      ignored: Array.isArray(savedCveState.ignored)
        ? savedCveState.ignored
        : [],
      tags: savedCveState.tags || {}, // { [cveId]: ["tag1", "tag2"] }
      notified: Array.isArray(savedCveState.notified)
        ? savedCveState.notified
        : [], // remember sent notifications
    });

    function saveCveState() {
      try {
        localStorage.setItem("qc.cve.state", JSON.stringify(cveState));
      } catch {}
    }

    function togglePinCve(id) {
      const i = cveState.pinned.indexOf(id);
      if (i >= 0) cveState.pinned.splice(i, 1);
      else cveState.pinned.push(id);
      saveCveState();
    }
    function toggleIgnoreCve(id) {
      const i = cveState.ignored.indexOf(id);
      if (i >= 0) cveState.ignored.splice(i, 1);
      else cveState.ignored.push(id);
      saveCveState();
    }
    function addTagToCve(id, tag) {
      const t = (tag || "").trim();
      if (!t) return;
      if (!cveState.tags[id]) cveState.tags[id] = [];
      if (!cveState.tags[id].includes(t)) cveState.tags[id].push(t);
      saveCveState();
    }
    function removeTagFromCve(id, tag) {
      const arr = cveState.tags[id];
      if (!arr) return;
      const i = arr.indexOf(tag);
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) delete cveState.tags[id];
      saveCveState();
    }

    // Per-CVE tag input values for the UI
    const tagInputs = reactive({});

    // Filters for CVE triage
    const defaultCveFilters = {
      vendor: "",
      product: "",
      minCvss: 0,
      maxCvss: 10,
      onlyKEV: false,
      minEPSS: 0,
      days: 30, // 0 means any time
      sortKey: "epss", // epss | cvss | published | kev
      sortDir: "desc", // asc | desc
    };
    const savedCveFilters = (() => {
      try {
        return (
          JSON.parse(localStorage.getItem("qc.cve.filters") || "null") || {}
        );
      } catch {
        return {};
      }
    })();
    const cveFilters = reactive({ ...defaultCveFilters, ...savedCveFilters });

    function saveCveFilters() {
      try {
        localStorage.setItem("qc.cve.filters", JSON.stringify(cveFilters));
      } catch {}
    }

    function resetCveFilters() {
      Object.assign(cveFilters, defaultCveFilters);
      saveCveFilters();
    }

    function quickKEV() {
      cveFilters.onlyKEV = true;
      saveCveFilters();
    }
    function quickHighEPSS() {
      cveFilters.minEPSS = 0.5;
      cveFilters.sortKey = "epss";
      cveFilters.sortDir = "desc";
      saveCveFilters();
    }
    function quickHighCVSS() {
      cveFilters.minCvss = 9;
      cveFilters.sortKey = "cvss";
      cveFilters.sortDir = "desc";
      saveCveFilters();
    }
    function quickRecent7() {
      cveFilters.days = 7;
      cveFilters.sortKey = "published";
      cveFilters.sortDir = "desc";
      saveCveFilters();
    }

    const cveView = computed(() => {
      let arr = Array.isArray(cve.items) ? [...cve.items] : [];

      // Apply ignore list
      arr = arr.filter((it) => !cveState.ignored.includes(it.id));

      // Filters
      const v = (cveFilters.vendor || "").toLowerCase();
      const p = (cveFilters.product || "").toLowerCase();
      if (v)
        arr = arr.filter((it) =>
          (it.products || []).some((s) => s.toLowerCase().includes(v))
        );
      if (p)
        arr = arr.filter((it) =>
          (it.products || []).some((s) => s.toLowerCase().includes(p))
        );

      if (typeof cveFilters.minCvss === "number")
        arr = arr.filter(
          (it) => it.cvss == null || it.cvss >= cveFilters.minCvss
        );
      if (typeof cveFilters.maxCvss === "number")
        arr = arr.filter(
          (it) => it.cvss == null || it.cvss <= cveFilters.maxCvss
        );

      if (cveFilters.onlyKEV) arr = arr.filter((it) => it.kev);

      if (typeof cveFilters.minEPSS === "number")
        arr = arr.filter(
          (it) => it.epss == null || it.epss >= cveFilters.minEPSS
        );

      const days = Number(cveFilters.days || 0);
      if (days > 0)
        arr = arr.filter((it) => {
          if (!it.published) return true;
          const d = new Date(it.published);
          if (isNaN(d)) return true;
          const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
          return diff <= days;
        });

      // Sort with pinned first
      const key = cveFilters.sortKey;
      const dir = cveFilters.sortDir === "asc" ? 1 : -1;
      const val = (it) => {
        if (key === "kev") return it.kev ? 1 : 0;
        if (key === "published")
          return new Date(it.published || 0).getTime() || 0;
        return it[key] ?? -Infinity; // epss, cvss
      };
      arr.sort((a, b) => {
        const ap = cveState.pinned.includes(a.id) ? 1 : 0;
        const bp = cveState.pinned.includes(b.id) ? 1 : 0;
        if (ap !== bp) return bp - ap; // pinned first
        const va = val(a);
        const vb = val(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return va === vb ? 0 : va > vb ? dir : -dir;
      });

      return arr;
    });

    // Bookmarks
    const bookmark = reactive({
      newTitle: "",
      newUrl: "",
      items: JSON.parse(localStorage.getItem("qc.bookmarks") || "[]"),
    });

    // Notes
    let notes =
      localStorage.getItem("qc.notes") ||
      '<div><span class="prompt">$</span> Welcome. Type notes here…</div>';

    function formatTime(iso) {
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return "";
      }
    }

    async function refreshGitHub() {
      loading.github = true;
      try {
        const evs = await fetchGitHubEvents(settings.githubUser, auth.token);
        github.events = evs.slice(0, 20);
      } catch (e) {
        console.error(e);
      } finally {
        loading.github = false;
      }
    }

    async function refreshRSS() {
      loading.rss = true;
      try {
        // Persist sources before fetch
        try {
          localStorage.setItem("qc.rss.sources", JSON.stringify(rss.sources));
        } catch {}
        rss.items = await fetchSecurityRSS(rss.sources.map((s) => s.url));
      } catch (e) {
        console.error(e);
      } finally {
        loading.rss = false;
      }
    }

    // RSS manager
    function addRssSource() {
      if (!rss.newSourceName || !rss.newSourceUrl) return;
      rss.sources.push({ name: rss.newSourceName, url: rss.newSourceUrl });
      rss.newSourceName = "";
      rss.newSourceUrl = "";
      try {
        localStorage.setItem("qc.rss.sources", JSON.stringify(rss.sources));
      } catch {}
      refreshRSS();
    }
    function removeRssSource(i) {
      rss.sources.splice(i, 1);
      try {
        localStorage.setItem("qc.rss.sources", JSON.stringify(rss.sources));
      } catch {}
      refreshRSS();
    }

    async function refreshCVEs() {
      loading.cve = true;
      try {
        cve.items = await fetchLatestCVEs();
        // Notifications for high EPSS / KEV
        try {
          const toNotify = cve.items.filter(
            (x) =>
              (x.kev || (typeof x.epss === "number" && x.epss >= 0.5)) &&
              !cveState.notified.includes(x.id)
          );
          if (toNotify.length) {
            // Request permission if needed
            if ("Notification" in window) {
              if (Notification.permission === "default") {
                try {
                  await Notification.requestPermission();
                } catch {}
              }
              if (Notification.permission === "granted") {
                toNotify.slice(0, 3).forEach((n) => {
                  new Notification(`CVE Alert: ${n.id}`, {
                    body: `${n.kev ? "KEV" : ""}${
                      n.kev && n.epss != null ? " · " : ""
                    }${
                      n.epss != null ? `EPSS ${(n.epss * 100).toFixed(1)}%` : ""
                    } — ${n.summary?.slice(0, 80) || ""}`,
                  });
                });
              }
            }
            // Remember notified
            cveState.notified.push(...toNotify.map((t) => t.id));
            saveCveState();
          }
        } catch {}
      } catch (e) {
        console.error(e);
      } finally {
        loading.cve = false;
      }
    }

    async function refreshCTF() {
      loading.ctf = true;
      try {
        ctf.events = await fetchCTFTimeEvents();
      } catch (e) {
        console.error(e);
      } finally {
        loading.ctf = false;
      }
    }

    async function refreshAll() {
      await Promise.all([
        refreshGitHub(),
        refreshRSS(),
        refreshCVEs(),
        refreshCTF(),
      ]);
    }

    async function loginWithGitHub() {
      // Normalize GH_PROXY to absolute https URL and remove trailing slashes
      let raw = (window.GH_PROXY || "").trim();
      if (!raw) {
        auth.message =
          "Set window.GH_PROXY to your Worker URL for OAuth login.";
        return;
      }
      if (!/^https?:\/\//i.test(raw)) {
        raw = "https://" + raw;
      }
      const proxyBase = raw.replace(/\/+$/, "");

      auth.loading = true;
      auth.message = "Opening GitHub login…";
      let popup;
      const workerOrigin = (() => {
        try {
          return new URL(proxyBase).origin;
        } catch {
          return "";
        }
      })();

      function onMsg(e) {
        // Only accept messages from the Worker origin
        if (!workerOrigin || e.origin !== workerOrigin) return;
        if (e.data?.type === "gh_token") {
          window.removeEventListener("message", onMsg);
          if (popup && !popup.closed) popup.close();
          if (e.data.error) {
            console.error("OAuth error:", e.data.error);
            auth.message = "Login failed.";
            auth.loading = false;
            return;
          }
          const token = e.data.token;
          if (token) {
            auth.token = token;
            localStorage.setItem("qc.gh.token", token);
            auth.message = "Authenticated with GitHub.";
            refreshGitHub();
          } else {
            auth.message = "Login failed.";
          }
          auth.loading = false;
        }
      }
      window.addEventListener("message", onMsg);
      try {
        const startUrl = `${proxyBase}/oauth/start`;
        popup = window.open(startUrl, "gh_oauth", "width=600,height=700");
        if (!popup) {
          window.removeEventListener("message", onMsg);
          auth.message = "Popup blocked. Allow popups and try again.";
          auth.loading = false;
        }
      } catch (e) {
        console.error(e);
        window.removeEventListener("message", onMsg);
        auth.message = "Login failed.";
        auth.loading = false;
      }
    }

    function logout() {
      auth.token = null;
      localStorage.removeItem("qc.gh.token");
      auth.message = "Logged out.";
    }

    function addBookmark() {
      if (!bookmark.newTitle || !bookmark.newUrl) return;
      bookmark.items.push({ title: bookmark.newTitle, url: bookmark.newUrl });
      bookmark.newTitle = "";
      bookmark.newUrl = "";
      localStorage.setItem("qc.bookmarks", JSON.stringify(bookmark.items));
    }
    function removeBookmark(i) {
      bookmark.items.splice(i, 1);
      localStorage.setItem("qc.bookmarks", JSON.stringify(bookmark.items));
    }

    function onNotesInput(e) {
      localStorage.setItem("qc.notes", e.target.innerHTML);
    }

    // Global search
    const globalSearch = reactive({ query: "" });
    const globalResults = computed(() => {
      const q = (globalSearch.query || "").toLowerCase().trim();
      if (!q) return [];
      const results = [];
      // GitHub
      github.events.forEach((ev) => {
        const text = `${ev.type} ${ev.repo?.name || ""} ${
          ev.payload?.commits?.[0]?.message || ""
        }`.toLowerCase();
        if (text.includes(q))
          results.push({
            type: "GitHub",
            title: ev.type,
            url: `https://github.com/${ev.repo?.name || ""}`,
          });
      });
      // RSS
      rss.items.forEach((it) => {
        const text = `${it.title} ${it.source}`.toLowerCase();
        if (text.includes(q))
          results.push({ type: "RSS", title: it.title, url: it.link });
      });
      // CVE
      cve.items.forEach((it) => {
        const text = `${it.id} ${it.summary || ""} ${(it.products || []).join(
          " "
        )}`.toLowerCase();
        if (text.includes(q))
          results.push({
            type: "CVE",
            title: it.id,
            url: `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${it.id}`,
          });
      });
      // CTF
      ctf.events.forEach((it) => {
        const text = `${it.title} ${it.format}`.toLowerCase();
        if (text.includes(q))
          results.push({ type: "CTF", title: it.title, url: it.ctftime_url });
      });
      // Bookmarks
      bookmark.items.forEach((it) => {
        const text = `${it.title} ${it.url}`.toLowerCase();
        if (text.includes(q))
          results.push({ type: "Bookmark", title: it.title, url: it.url });
      });
      return results.slice(0, 50);
    });

    // Gist sync
    const gist = reactive({
      id: localStorage.getItem("qc.gist.id") || "",
      loading: false,
      message: "",
    });
    async function saveToGist() {
      if (!auth.token) {
        gist.message = "Login with GitHub first.";
        return;
      }
      gist.loading = true;
      gist.message = "Saving to Gist…";
      try {
        const id = await saveDashboardDataToGist(
          auth.token,
          {
            bookmarks: bookmark.items,
            notes,
            rssSources: rss.sources,
            cvePinned: cveState.pinned,
            cveIgnored: cveState.ignored,
            cveTags: cveState.tags,
          },
          gist.id || null
        );
        gist.id = id;
        localStorage.setItem("qc.gist.id", id);
        gist.message = "Saved.";
      } catch (e) {
        console.error(e);
        gist.message = "Save failed.";
      } finally {
        gist.loading = false;
      }
    }
    async function loadFromGist() {
      if (!auth.token || !gist.id) {
        gist.message = "Login and set a Gist ID.";
        return;
      }
      gist.loading = true;
      gist.message = "Loading from Gist…";
      try {
        const data = await loadDashboardDataFromGist(auth.token, gist.id);
        if (Array.isArray(data.bookmarks)) {
          bookmark.items = data.bookmarks;
          localStorage.setItem("qc.bookmarks", JSON.stringify(bookmark.items));
        }
        if (typeof data.notes === "string") {
          notes = data.notes;
          localStorage.setItem("qc.notes", notes);
        }
        if (Array.isArray(data.rssSources)) {
          rss.sources = data.rssSources;
          localStorage.setItem("qc.rss.sources", JSON.stringify(rss.sources));
          await refreshRSS();
        }
        if (data.cveState) {
          cveState.pinned = Array.isArray(data.cveState.pinned)
            ? data.cveState.pinned
            : [];
          cveState.ignored = Array.isArray(data.cveState.ignored)
            ? data.cveState.ignored
            : [];
          cveState.tags = data.cveState.tags || {};
          saveCveState();
        }
        gist.message = "Loaded.";
      } catch (e) {
        console.error(e);
        gist.message = "Load failed.";
      } finally {
        gist.loading = false;
      }
    }

    // init from storage
    const savedToken = localStorage.getItem("qc.gh.token");
    if (savedToken) auth.token = savedToken;

    // initial fetch
    refreshAll();

    return {
      settings,
      auth,
      loading,
      github,
      rss,
      cve,
      ctf,
      // CVE filters and view
      cveFilters,
      cveView,
      saveCveFilters,
      resetCveFilters,
      quickKEV,
      quickHighEPSS,
      quickHighCVSS,
      quickRecent7,
      // CVE state
      cveState,
      togglePinCve,
      toggleIgnoreCve,
      addTagToCve,
      removeTagFromCve,
      // RSS
      addRssSource,
      removeRssSource,
      // other
      bookmark,
      notes,
      tagInputs,
      globalSearch,
      globalResults,
      gist,
      saveToGist,
      loadFromGist,
      refreshAll,
      loginWithGitHub,
      logout,
      addBookmark,
      removeBookmark,
      onNotesInput,
      formatTime,
    };
  },
};

createApp(app).mount("#app");
