const DATA_URL = "./generated/gallery-index.json";

const INITIAL_LOAD = 20;
const LOAD_STEP = 20;
const KEEP_BEFORE = 14;
const KEEP_AFTER = 14;
const SHIFT_BUFFER = 5;
const THUMB_ROOT_MARGIN = "300px";

const state = {
  data: null,
  galleries: [],
  groups: [],
  files: [],
  sourceTitle: "Archive"
};

const readerState = {
  open: false,
  loadedUntil: 0,
  centerIndex: 0,
  currentWindowStart: 0,
  currentWindowEnd: 0,
  heights: new Map(),
  thumbObserver: null,
  lastScrollTop: 0,
  scrollTicking: false
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

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function titleCaseSlug(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractGroupFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      return safeDecode(segments[segments.length - 2]);
    }
    return "Misc";
  } catch {
    const cleaned = String(url).split("?")[0].split("#")[0];
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return safeDecode(parts[parts.length - 2]);
    }
    return "Misc";
  }
}

function fileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return safeDecode(segments[segments.length - 1] || "image");
  } catch {
    const cleaned = String(url).split("?")[0].split("#")[0];
    const parts = cleaned.split("/").filter(Boolean);
    return safeDecode(parts[parts.length - 1] || "image");
  }
}

function buildFlatFilesFromGenerated(data) {
  const galleries = Array.isArray(data.galleries) ? data.galleries : [];
  const flat = [];

  for (const gallery of galleries) {
    const galleryTitle = gallery.title || titleCaseSlug(gallery.slug || "Gallery");
    const links = Array.isArray(gallery.links) ? gallery.links : [];

    for (const url of links) {
      flat.push({
        url,
        name: fileNameFromUrl(url),
        groupTitle: extractGroupFromUrl(url),
        galleryTitle,
        gallerySlug: gallery.slug || "",
        source: gallery.source || "",
        generatedFromFilename: gallery.generated_from_filename || ""
      });
    }
  }

  return flat;
}

function groupFiles(files) {
  const map = new Map();

  for (const file of files) {
    const key = file.groupTitle || "Misc";
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(file);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([title, items]) => ({ title, items }));
}

function renderHero() {
  els.heroTitle.textContent = state.sourceTitle;
  els.heroText.textContent =
    "Loaded from generated/gallery-index.json. Sections are inferred from directory names inside each image URL. The reader uses a fixed sliding window with scroll-based updates only, to avoid end-of-stack flutter.";

  els.groupCount.textContent = String(state.groups.length);
  els.imageCount.textContent = String(state.files.length);
}

function renderGroupNav() {
  if (!state.groups.length) {
    els.groupNav.innerHTML = `<div class="state-box">No sections found.</div>`;
    return;
  }

  els.groupNav.innerHTML = state.groups
    .map((group, index) => {
      const targetId = `group-${index}`;
      return `
        <button class="group-chip" type="button" data-target="${escapeHtml(targetId)}">
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
  document.querySelectorAll("img.thumb-lazy[data-src]").forEach((img) => {
    readerState.thumbObserver.observe(img);
  });
}

function renderGroups() {
  if (!state.groups.length) {
    els.groupsContainer.innerHTML = `<div class="state-box">No images found in generated/gallery-index.json.</div>`;
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
                const globalIndex = state.files.indexOf(file);

                return `
                  <button class="thumb-card" type="button" data-open-index="${globalIndex}">
                    <div class="thumb-media">
                      <img
                        class="thumb-lazy"
                        data-src="${escapeHtml(file.url)}"
                        alt="${escapeHtml(file.name)}"
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
      openReader(Number(button.dataset.openIndex));
    });
  });
}

function updateReaderHeader() {
  els.readerTitle.textContent = state.sourceTitle;
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
  img.src = file.url;

  img.addEventListener("load", () => {
    const measured = page.offsetHeight;
    if (measured > 0) {
      readerState.heights.set(index, measured);
    }
  });

  const meta = document.createElement("div");
  meta.className = "reader-page-meta";
  meta.textContent = `${file.groupTitle} · Page ${index + 1} of ${state.files.length}`;

  page.appendChild(img);
  page.appendChild(meta);
  return page;
}

function makeSpacer(index) {
  const spacer = document.createElement("div");
  spacer.className = "reader-spacer";
  spacer.dataset.index = String(index);
  spacer.style.height = `${readerState.heights.get(index) || 520}px`;
  return spacer;
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
    const oldHeight = els.readerBody.scrollHeight;
    const oldTop = els.readerBody.scrollTop;

    readerState.loadedUntil = Math.min(
      readerState.loadedUntil + LOAD_STEP,
      state.files.length
    );

    const nextWindow = computeWindowForCenter(readerState.centerIndex);
    renderReaderWindow(nextWindow.start, nextWindow.end);

    requestAnimationFrame(() => {
      const newHeight = els.readerBody.scrollHeight;
      if (newHeight > oldHeight) {
        els.readerBody.scrollTop = oldTop;
      }
    });
  });

  wrap.appendChild(button);
  return wrap;
}

function computeWindowForCenter(centerIndex) {
  const maxLoadedIndex = readerState.loadedUntil - 1;
  const start = Math.max(0, centerIndex - KEEP_BEFORE);
  const end = Math.min(maxLoadedIndex, centerIndex + KEEP_AFTER);
  return { start, end };
}

function renderReaderWindow(start, end) {
  const oldTop = els.readerBody.scrollTop;
  const oldAnchorIndex = findClosestIndexToViewportCenter();

  readerState.currentWindowStart = start;
  readerState.currentWindowEnd = end;

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

  requestAnimationFrame(() => {
    const anchor = document.getElementById(`reader-page-${oldAnchorIndex}`);
    if (anchor) {
      const desiredTop = Math.max(0, anchor.offsetTop - 120);
      els.readerBody.scrollTop = desiredTop;
    } else {
      els.readerBody.scrollTop = oldTop;
    }
  });
}

function findClosestIndexToViewportCenter() {
  const pages = Array.from(els.readerStack.querySelectorAll(".reader-page"));
  if (!pages.length) {
    return readerState.centerIndex;
  }

  const viewportCenter = els.readerBody.scrollTop + (els.readerBody.clientHeight / 2);

  let bestIndex = readerState.centerIndex;
  let bestDistance = Infinity;

  for (const page of pages) {
    const center = page.offsetTop + (page.offsetHeight / 2);
    const distance = Math.abs(center - viewportCenter);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = Number(page.dataset.index);
    }
  }

  return bestIndex;
}

function maybeShiftReaderWindow() {
  const center = findClosestIndexToViewportCenter();
  readerState.centerIndex = center;

  const nearTop = center <= readerState.currentWindowStart + SHIFT_BUFFER;
  const nearBottom = center >= readerState.currentWindowEnd - SHIFT_BUFFER;

  const atAbsoluteTop = readerState.currentWindowStart === 0 && center <= SHIFT_BUFFER;
  const atAbsoluteBottom =
    readerState.currentWindowEnd >= readerState.loadedUntil - 1 &&
    center >= Math.max(0, readerState.loadedUntil - 1 - SHIFT_BUFFER);

  if (atAbsoluteTop || atAbsoluteBottom) {
    return;
  }

  if (!nearTop && !nearBottom) {
    return;
  }

  const next = computeWindowForCenter(center);

  if (
    next.start === readerState.currentWindowStart &&
    next.end === readerState.currentWindowEnd
  ) {
    return;
  }

  renderReaderWindow(next.start, next.end);
}

function onReaderScroll() {
  if (readerState.scrollTicking) return;

  readerState.scrollTicking = true;
  requestAnimationFrame(() => {
    maybeShiftReaderWindow();
    readerState.scrollTicking = false;
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

  const initialWindow = computeWindowForCenter(startIndex);

  els.reader.classList.add("open");
  els.reader.setAttribute("aria-hidden", "false");
  document.body.classList.add("reader-open");

  renderReaderWindow(initialWindow.start, initialWindow.end);

  requestAnimationFrame(() => {
    const target = document.getElementById(`reader-page-${startIndex}`);
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "auto" });
    }
  });
}

function closeReader() {
  readerState.open = false;
  els.reader.classList.remove("open");
  els.reader.setAttribute("aria-hidden", "true");
  document.body.classList.remove("reader-open");
  els.readerStack.innerHTML = "";
}

function bindEvents() {
  els.openReaderFromTop.addEventListener("click", () => {
    openReader(0);
  });

  els.closeReaderBtn.addEventListener("click", closeReader);

  els.readerTopBtn.addEventListener("click", () => {
    els.readerBody.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.reader.addEventListener("click", (event) => {
    if (event.target === els.reader) {
      closeReader();
    }
  });

  els.readerBody.addEventListener("scroll", onReaderScroll, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && readerState.open) {
      closeReader();
    }
  });
}

function renderError(message) {
  els.heroTitle.textContent = "Could not load archive";
  els.heroText.textContent = message;
  els.groupCount.textContent = "0";
  els.imageCount.textContent = "0";
  els.groupNav.innerHTML = "";
  els.groupsContainer.innerHTML = `<div class="state-box">${escapeHtml(message)}</div>`;
}

async function init() {
  try {
    els.groupsContainer.innerHTML = `<div class="state-box">Loading archive...</div>`;

    state.data = await loadJson(DATA_URL);
    state.galleries = Array.isArray(state.data.galleries) ? state.data.galleries : [];
    state.files = buildFlatFilesFromGenerated(state.data);
    state.groups = groupFiles(state.files);

    if (state.galleries.length === 1) {
      state.sourceTitle = state.galleries[0].title || "Archive";
    } else if (state.galleries.length > 1) {
      state.sourceTitle = "Combined Archive";
    } else {
      state.sourceTitle = "Archive";
    }

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
