// Minimal Vue 3 app using CDN build; services fetch via CORS-friendly endpoints
import {
  createApp,
  reactive,
} from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import {
  fetchGitHubEvents,
  startGitHubDeviceLogin,
  pollGitHubDeviceToken,
} from "./services/github.js";
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
      const clientId = window.GITHUB_CLIENT_ID || "";
      const proxyBase = (window.GH_PROXY || "").replace(/\/$/, "");
      if (!clientId) {
        auth.message = "Provide GITHUB_CLIENT_ID in index.html <script>";
        return;
      }
      if (!proxyBase) {
        auth.message =
          "Set window.GH_PROXY to your Worker URL for OAuth login.";
        return;
      }
      auth.loading = true;
      auth.message = "Opening GitHub login…";
      let popup;
      const origin = location.origin;
      function onMsg(e) {
        // Only accept messages from our site origin (Worker posts back to this origin)
        if (e.origin !== origin) return;
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
        popup = window.open(
          `${proxyBase}/oauth/start`,
          "gh_oauth",
          "width=600,height=700"
        );
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
