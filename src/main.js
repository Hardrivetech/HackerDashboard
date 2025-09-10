// Minimal Vue 3 app using CDN build; services fetch via CORS-friendly endpoints
import {
  createApp,
  reactive,
  computed,
} from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { fetchGitHubEvents } from "./services/github.js";
import { fetchSecurityRSS } from "./services/rss.js";
import { fetchLatestCVEs } from "./services/cve.js";
import { fetchCTFTimeEvents } from "./services/ctf.js";

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
    const rss = reactive({
      items: [],
      sources: [
        {
          name: "TheHackerNews",
          url: "https://feeds.feedburner.com/TheHackersNews",
        },
        { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
        {
          name: "HN Security",
          url: "https://hnrss.org/frontpage?points=150&count=20",
        },
      ],
    });
    const cve = reactive({ items: [] });
    const ctf = reactive({ events: [] });

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

      // Sort
      const key = cveFilters.sortKey;
      const dir = cveFilters.sortDir === "asc" ? 1 : -1;
      const val = (it) => {
        if (key === "kev") return it.kev ? 1 : 0;
        if (key === "published")
          return new Date(it.published || 0).getTime() || 0;
        return it[key] ?? -Infinity; // epss, cvss
      };
      arr.sort((a, b) => {
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
        rss.items = await fetchSecurityRSS(rss.sources.map((s) => s.url));
      } catch (e) {
        console.error(e);
      } finally {
        loading.rss = false;
      }
    }

    async function refreshCVEs() {
      loading.cve = true;
      try {
        cve.items = await fetchLatestCVEs();
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
      // other
      bookmark,
      notes,
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
