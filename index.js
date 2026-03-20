const DATA_URL = "./uploaded_directories/archive.json"; // change this to your JSON file

const INITIAL_LOAD = 20;
const LOAD_STEP = 20;
const KEEP_BEFORE = 10;
const KEEP_AFTER = 10;
const THUMB_ROOT_MARGIN = "300px";
const READER_ROOT_MARGIN = "1200px";

const state = {
  data: null,
  groups: [],
  files: [],
  globalIndexByUrl: new Map()
};

const readerState = {
  open: false,
  loadedUntil: 0,
  centerIndex: 0,
  heights: new Map(),
  thumbObserver: null,
  readerImgObserver: null,
  refreshQueued: false
};

const els = {
  heroTitle: document.getElementById("heroTitle"),
  heroText: document.getElementById("heroText"),
  groupCount: document.getElementById("groupCount"),
  imageCount: document.getElementById("imageCount"),
  groupNav: document.getElementById("groupNav"),
  groupsContainer: document.getElementById("groupsContainer"),
  openReaderFromTop: document.getElementById("openReaderFromTop"),
  reader: document.getElementById("reader"),
  readerTitle: document.getElementById("readerTitle"),
  readerSubtitle: document.getElementById("readerSubtitle"),
  readerTopBtn: document.getElementById("readerTopBtn"),
  closeReaderBtn: document.getElementById("closeReaderBtn"),
  readerBody: document.getElementById("readerBody"),
  readerStack: document.getElementById("readerStack")
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[char];
  });
}

async function loadJson(url) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Failed to load JSON: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function topDirFromPath(filePath) {
  if (!filePath || typeof filePath !== "string") return "Misc";
  const normalized = filePath.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  return parts[0] || "Misc";
}

function buildGroupsFromJson(data) {
  if (data.tree && typeof data.tree === "object" && !Array.isArray(data.tree)) {
    const groups = Object.entries(data.tree).map(([title, node]) => ({
      title,
      items: Array.isArray(node?._files) ? node._files.slice() : []
    }));

    groups.sort((a, b) => a.title.localeCompare(b.title));
    return groups;
  }

  const grouped = new Map();
  const files = Array.isArray(data.files) ? data.files : [];

  for (const file of files) {
    const title = topDirFromPath(file.path);

    if (!grouped.has(title)) {
      grouped.set(title, []);
    }

    grouped.get(title).push(file);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([title, items]) => ({ title, items }));
}

function flattenGroups(groups) {
  const flat = [];

  for (const group of groups) {
    for (const item of group.items) {
      flat.push({
        ...item,
        groupTitle: group.title
      });
    }
  }

  return flat;
}

function buildGlobalIndexMap(files) {
  const map = new Map();
  files.forEach((file, index) => {
    map.set(file.url, index);
  });
  return map;
}

function renderHero() {
  els.heroTitle.textContent = "Archive ready";
  els.heroText.textContent =
    "Sections are derived directly from the first directory in files[].path. " +
    "Thumbnails lazy-load, and the reader uses a sliding window so the browser does not have to keep the whole stack live at once.";

  els.groupCount.textContent = String(state.groups.length);
  els.imageCount.textContent = String(state.files.length);
}

function renderGroupNav() {
  if (!state.groups.length) {
    els.groupNav.innerHTML = `<div class="state-box">No directory groups found.</div>`;
    return;
  }

  els.groupNav.innerHTML = state.groups
    .map((group, index) => {
      const anchorId = `group-${index}`;
      return `
        <button class="group-chip" type="button" data-target="${escapeHtml(anchorId)}">
          ${escapeHtml(group.title)} (${group.items.length})
        </button>
      `;
    })
    .join("");

  els.groupNav.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function createThumbObserver() {
  if (readerState.thumbObserver) {
    readerState.thumbObserver.disconnect();
  }

  readerState.thumbObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        const src = img.dataset.src;
        if (src && !img.src) {
          img.src = src;
        }
        observer.unobserve(img);
      }
    },
    {
      root: null,
      rootMargin: THUMB_ROOT_MARGIN,
      threshold: 0.01
    }
  );
}

function observeThumbs() {
  createThumbObserver();

  document.querySelectorAll("img[data-src].thumb-lazy").forEach((img) => {
    readerState.thumbObserver.observe(img);
  });
}

function renderGroups() {
  if (!state.groups.length) {
    els.groupsContainer.innerHTML = `<div class="state-box">No images found in the supplied JSON.</div>`;
    return;
  }

  els.groupsContainer.innerHTML = state.groups
    .map((group, groupIndex) => {
      const sectionId = `group-${groupIndex}`;

      return `
        <section id="${escapeHtml(sectionId)}" class="group-section">
          <div class="group-header">
            <div>
              <h3 class="group-title">${escapeHtml(group.title)}</h3>
              <div class="group-meta">${group.items.length} image${group.items.length === 1 ? "" : "s"}</div>
            </div>
          </div>

          <div class="thumb-grid">
            ${group.items
              .map((file) => {
                const globalIndex = state.globalIndexByUrl.get(file.url);
                return `
                  <button class="thumb-card" type="button" data-open-index="${globalIndex}">
                    <div class="thumb-media">
                      <img
                        class="thumb-lazy"
                        data-src="${escapeHtml(file.url)}"
                        alt="${escapeHtml(file.name || group.title)}"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div class="thumb-overlay">
                      <div class="thumb-index">#${globalIndex + 1}</div>
                      <div class="thumb-cta">Open reader</div>
                    </div>
                  </button>
                `;
              })
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  observeThumbs();

  els.groupsContainer.querySelectorAll("[data-open-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.openIndex);
      openReader(index);
    });
  });
}

function updateReaderHeader() {
  els.readerTitle.textContent = "Reader";
  els.readerSubtitle.textContent = `${readerState.loadedUntil} loaded · ${state.files.length} total`;
}

function makeReaderPage(index, file) {
  const page = document.createElement("article");
  page.className = "reader-page";
  page.id = `reader-page-${index}`;
  page.dataset.index = String(index);

  const img = document.createElement("img");
  img.alt = file.name || `Image ${index + 1}`;
  img.loading = "lazy";
  img.decoding = "async";
  img.dataset.src = file.url;

  img.addEventListener("load", () => {
    const measured = page.offsetHeight;
    if (measured > 0) {
      readerState.heights.set(index, measured);
    }
  });

  const meta = document.createElement("div");
  meta.className = "reader-page-meta";
  meta.textContent = `${file.groupTitle || topDirFromPath(file.path)} · Page ${index + 1} of ${state.files.length}`;

  page.appendChild(img);
  page.appendChild(meta);
  return page;
}

function makeSpacer(index) {
  const spacer = document.createElement("div");
  spacer.className = "reader-spacer";
  spacer.dataset.index = String(index);
  spacer.style.height = `${readerState.heights.get(index) || 420}px`;
  return spacer;
}

function createReaderImgObserver() {
  if (readerState.readerImgObserver) {
    readerState.readerImgObserver.disconnect();
  }

  readerState.readerImgObserver = new IntersectionObserver(
    (entries) => {
      let bestIndex = readerState.centerIndex;
      let bestRatio = 0;

      for (const entry of entries) {
        const img = entry.target;

        if (entry.isIntersecting && img.dataset.src && !img.src) {
          img.src = img.dataset.src;
        }

        if (entry.isIntersecting) {
          const page = img.closest(".reader-page");
          if (page) {
            const index = Number(page.dataset.index);
            if (entry.intersectionRatio > bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestIndex = index;
            }
          }
        }
      }

      if (bestIndex !== readerState.centerIndex) {
        readerState.centerIndex = bestIndex;
        queueReaderRefresh();
      }
    },
    {
      root: els.readerBody,
      rootMargin: READER_ROOT_MARGIN,
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
    }
  );
}

function observeReaderImages() {
  createReaderImgObserver();

  els.readerStack.querySelectorAll(".reader-page img[data-src]").forEach((img) => {
    readerState.readerImgObserver.observe(img);
  });
}

function currentReaderWindow() {
  const start = Math.max(0, readerState.centerIndex - KEEP_BEFORE);
  const end = Math.min(readerState.loadedUntil - 1, readerState.centerIndex + KEEP_AFTER);
  return { start, end };
}

function buildKeepReadingButton() {
  if (readerState.loadedUntil >= state.files.length) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "keep-reading-wrap";

  const button = document.createElement("button");
  button.className = "keep-reading";
  button.type = "button";
  button.textContent = "Keep reading";

  button.addEventListener("click", () => {
    readerState.loadedUntil = Math.min(
      readerState.loadedUntil + LOAD_STEP,
      state.files.length
    );
    renderReaderWindow();
  });

  wrap.appendChild(button);
  return wrap;
}

function renderReaderWindow() {
  const prevScrollTop = els.readerBody.scrollTop;
  const { start, end } = currentReaderWindow();

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < readerState.loadedUntil; i++) {
    if (i >= start && i <= end) {
      fragment.appendChild(makeReaderPage(i, state.files[i]));
    } else {
      fragment.appendChild(makeSpacer(i));
    }
  }

  const keepReading = buildKeepReadingButton();
  if (keepReading) {
    fragment.appendChild(keepReading);
  }

  els.readerStack.innerHTML = "";
  els.readerStack.appendChild(fragment);

  updateReaderHeader();
  observeReaderImages();

  els.readerBody.scrollTop = prevScrollTop;
}

function queueReaderRefresh() {
  if (readerState.refreshQueued) return;
  readerState.refreshQueued = true;

  requestAnimationFrame(() => {
    renderReaderWindow();
    readerState.refreshQueued = false;
  });
}

function openReader(startIndex = 0) {
  if (!state.files.length) return;

  readerState.open = true;
  readerState.centerIndex = startIndex;
  readerState.loadedUntil = Math.max(
    Math.min(INITIAL_LOAD, state.files.length),
    Math.min(startIndex + KEEP_AFTER + 1, state.files.length)
  );

  els.reader.classList.add("open");
  els.reader.setAttribute("aria-hidden", "false");
  document.body.classList.add("reader-open");

  renderReaderWindow();

  requestAnimationFrame(() => {
    const target = document.getElementById(`reader-page-${startIndex}`);
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "auto" });
    }
  });
}

function closeReader() {
  readerState.open = false;

  if (readerState.readerImgObserver) {
    readerState.readerImgObserver.disconnect();
  }

  els.reader.classList.remove("open");
  els.reader.setAttribute("aria-hidden", "true");
  document.body.classList.remove("reader-open");
  els.readerStack.innerHTML = "";
}

function bindEvents() {
  els.openReaderFromTop.addEventListener("click", () => {
    openReader(0);
  });

  els.closeReaderBtn.addEventListener("click", () => {
    closeReader();
  });

  els.readerTopBtn.addEventListener("click", () => {
    els.readerBody.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.reader.addEventListener("click", (event) => {
    if (event.target === els.reader) {
      closeReader();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && readerState.open) {
      closeReader();
    }
  });
}

function renderError(message) {
  els.heroTitle.textContent = "Could not load archive";
  els.heroText.textContent = message;
  els.groupNav.innerHTML = "";
  els.groupsContainer.innerHTML = `<div class="state-box">${escapeHtml(message)}</div>`;
  els.groupCount.textContent = "0";
  els.imageCount.textContent = "0";
}

async function init() {
  try {
    els.groupsContainer.innerHTML = `<div class="state-box">Loading archive...</div>`;

    state.data = await loadJson(DATA_URL);
    state.groups = buildGroupsFromJson(state.data);
    state.files = flattenGroups(state.groups);
    state.globalIndexByUrl = buildGlobalIndexMap(state.files);

    renderHero();
    renderGroupNav();
    renderGroups();
    bindEvents();
  } catch (error) {
    console.error(error);
    renderError(error.message || "Unknown error.");
  }
}

init();
