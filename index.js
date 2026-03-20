const INDEX_URL = "./generated/gallery-index.json";

const state = {
  data: null,
  activeGallery: null,
  lastFocusedThumb: null
};

const els = {
  gallerySelect: document.getElementById("gallerySelect"),
  galleryCards: document.getElementById("galleryCards"),
  imageGridContainer: document.getElementById("imageGridContainer"),
  heroTitle: document.getElementById("heroTitle"),
  heroText: document.getElementById("heroText"),
  galleryCount: document.getElementById("galleryCount"),
  imageCount: document.getElementById("imageCount"),
  activeGalleryTitle: document.getElementById("activeGalleryTitle"),
  activeGalleryMeta: document.getElementById("activeGalleryMeta"),
  openReaderTop: document.getElementById("openReaderTop"),
  reader: document.getElementById("reader"),
  readerBody: document.getElementById("readerBody"),
  readerStack: document.getElementById("readerStack"),
  readerTitle: document.getElementById("readerTitle"),
  readerSubtitle: document.getElementById("readerSubtitle"),
  closeReaderBtn: document.getElementById("closeReaderBtn"),
  jumpToTopBtn: document.getElementById("jumpToTopBtn")
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

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function setQueryParam(name, value) {
  const url = new URL(window.location.href);

  if (value === null || value === undefined || value === "") {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, value);
  }

  window.history.replaceState({}, "", url.toString());
}

function toTitleCase(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferThumbTitle(gallery) {
  if (gallery.title) return gallery.title;
  if (gallery.slug) return toTitleCase(gallery.slug);
  return "Untitled Gallery";
}

async function loadIndex() {
  const response = await fetch(INDEX_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${INDEX_URL} (${response.status})`);
  }
  return response.json();
}

function renderHero() {
  const galleryCount = Array.isArray(state.data?.galleries) ? state.data.galleries.length : 0;
  const activeCount = Array.isArray(state.activeGallery?.links) ? state.activeGallery.links.length : 0;

  els.galleryCount.textContent = String(galleryCount);
  els.imageCount.textContent = String(activeCount);

  if (state.activeGallery) {
    els.heroTitle.textContent = inferThumbTitle(state.activeGallery);
    els.heroText.textContent =
      `Selected gallery loaded from ${state.activeGallery.generated_from_filename || state.activeGallery.source || "generated data"}. ` +
      `Click any image to open the scroll reader and move downward through the full stack.`;
  } else {
    els.heroTitle.textContent = "Archive ready";
    els.heroText.textContent =
      "Choose a gallery below. New uploaded JSON files will appear automatically after the workflow rebuilds the generated index.";
  }
}

function renderSelect() {
  const galleries = Array.isArray(state.data?.galleries) ? state.data.galleries : [];

  if (!galleries.length) {
    els.gallerySelect.innerHTML = `<option value="">No galleries found</option>`;
    els.gallerySelect.disabled = true;
    return;
  }

  els.gallerySelect.disabled = false;
  els.gallerySelect.innerHTML = galleries
    .map((gallery) => {
      const title = inferThumbTitle(gallery);
      const selected = state.activeGallery?.slug === gallery.slug ? "selected" : "";
      return `<option value="${escapeHtml(gallery.slug)}" ${selected}>${escapeHtml(title)}</option>`;
    })
    .join("");
}

function renderGalleryCards() {
  const galleries = Array.isArray(state.data?.galleries) ? state.data.galleries : [];

  if (!galleries.length) {
    els.galleryCards.innerHTML = `<div class="empty-state">No galleries were found in the generated index.</div>`;
    return;
  }

  els.galleryCards.innerHTML = galleries
    .map((gallery) => {
      const title = inferThumbTitle(gallery);
      const isActive = state.activeGallery?.slug === gallery.slug;
      return `
        <button
          class="gallery-card ${isActive ? "active" : ""}"
          type="button"
          data-gallery-slug="${escapeHtml(gallery.slug)}"
        >
          <div class="gallery-card-top">
            <div>
              <h3 class="gallery-card-title">${escapeHtml(title)}</h3>
              <div class="gallery-card-meta">${escapeHtml(gallery.slug)}</div>
            </div>
            <div class="pill">${Number(gallery.image_count || 0)} images</div>
          </div>
          <div class="gallery-card-footer">${escapeHtml(gallery.generated_from_filename || gallery.source || "Generated gallery")}</div>
        </button>
      `;
    })
    .join("");

  els.galleryCards.querySelectorAll("[data-gallery-slug]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.getAttribute("data-gallery-slug");
      activateGallery(slug);
    });
  });
}

function renderImageGrid() {
  const gallery = state.activeGallery;

  if (!gallery) {
    els.activeGalleryTitle.textContent = "Gallery";
    els.activeGalleryMeta.textContent = "Choose a gallery to begin.";
    els.imageGridContainer.innerHTML = `<div class="empty-state">Select a gallery above to load its image grid.</div>`;
    els.openReaderTop.disabled = true;
    els.openReaderTop.style.opacity = "0.5";
    return;
  }

  const links = Array.isArray(gallery.links) ? gallery.links : [];
  const title = inferThumbTitle(gallery);

  els.activeGalleryTitle.textContent = title;
  els.activeGalleryMeta.textContent = `${links.length} image${links.length === 1 ? "" : "s"} in this gallery`;
  els.openReaderTop.disabled = !links.length;
  els.openReaderTop.style.opacity = links.length ? "1" : "0.5";

  if (!links.length) {
    els.imageGridContainer.innerHTML = `<div class="empty-state">This gallery does not contain any image links.</div>`;
    return;
  }

  els.imageGridContainer.innerHTML = `
    <div class="thumb-grid">
      ${links.map((url, index) => `
        <button
          class="thumb-card"
          type="button"
          data-thumb-index="${index}"
          aria-label="Open image ${index + 1} in reader"
        >
          <div class="thumb-media">
            <img
              src="${escapeHtml(url)}"
              alt="${escapeHtml(`${title} image ${index + 1}`)}"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="thumb-overlay">
            <div class="thumb-index">#${index + 1}</div>
            <div class="thumb-open">Open reader</div>
          </div>
        </button>
      `).join("")}
    </div>
  `;

  els.imageGridContainer.querySelectorAll("[data-thumb-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lastFocusedThumb = button;
      const index = Number(button.getAttribute("data-thumb-index"));
      openReader(index);
    });
  });
}

function buildReaderPages() {
  const gallery = state.activeGallery;
  const links = Array.isArray(gallery?.links) ? gallery.links : [];
  const title = inferThumbTitle(gallery);

  els.readerStack.innerHTML = links
    .map((url, index) => {
      return `
        <article class="reader-page" id="reader-page-${index}">
          <img
            src="${escapeHtml(url)}"
            alt="${escapeHtml(`${title} page ${index + 1}`)}"
            loading="lazy"
            decoding="async"
          />
          <div class="reader-page-meta">Page ${index + 1} of ${links.length}</div>
        </article>
      `;
    })
    .join("");
}

function openReader(startIndex = 0) {
  const gallery = state.activeGallery;
  if (!gallery || !Array.isArray(gallery.links) || !gallery.links.length) return;

  buildReaderPages();

  const title = inferThumbTitle(gallery);
  els.readerTitle.textContent = title;
  els.readerSubtitle.textContent = `${gallery.links.length} image${gallery.links.length === 1 ? "" : "s"} in vertical reader`;

  els.reader.classList.add("open");
  els.reader.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => {
    els.readerBody.scrollTop = 0;
    const target = document.getElementById(`reader-page-${startIndex}`);
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "auto" });
    }
  });
}

function closeReader() {
  els.reader.classList.remove("open");
  els.reader.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  if (state.lastFocusedThumb instanceof HTMLElement) {
    state.lastFocusedThumb.focus();
  }
}

function findGalleryBySlug(slug) {
  const galleries = Array.isArray(state.data?.galleries) ? state.data.galleries : [];
  return galleries.find((gallery) => gallery.slug === slug) || null;
}

function activateGallery(slug, pushToUrl = true) {
  const gallery = findGalleryBySlug(slug);
  if (!gallery) return;

  state.activeGallery = gallery;

  if (pushToUrl) {
    setQueryParam("gallery", gallery.slug);
  }

  renderHero();
  renderSelect();
  renderGalleryCards();
  renderImageGrid();
}

function bindEvents() {
  els.gallerySelect.addEventListener("change", (event) => {
    activateGallery(event.target.value);
  });

  els.openReaderTop.addEventListener("click", () => {
    openReader(0);
  });

  els.closeReaderBtn.addEventListener("click", closeReader);
  els.jumpToTopBtn.addEventListener("click", () => {
    els.readerBody.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.reader.addEventListener("click", (event) => {
    if (event.target === els.reader) {
      closeReader();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.reader.classList.contains("open")) {
      closeReader();
    }
  });

  window.addEventListener("popstate", () => {
    const slug = getQueryParam("gallery");
    if (!slug) return;

    const gallery = findGalleryBySlug(slug);
    if (gallery) {
      state.activeGallery = gallery;
      renderHero();
      renderSelect();
      renderGalleryCards();
      renderImageGrid();
    }
  });
}

async function init() {
  try {
    els.galleryCards.innerHTML = `<div class="loading-state">Loading galleries...</div>`;
    els.imageGridContainer.innerHTML = `<div class="loading-state">Loading image grid...</div>`;

    state.data = await loadIndex();

    const galleries = Array.isArray(state.data?.galleries) ? state.data.galleries : [];
    if (!galleries.length) {
      renderHero();
      renderSelect();
      renderGalleryCards();
      renderImageGrid();
      return;
    }

    const requestedSlug = getQueryParam("gallery");
    const initialGallery =
      (requestedSlug && findGalleryBySlug(requestedSlug)) ||
      galleries[0];

    state.activeGallery = initialGallery;

    if (!requestedSlug && initialGallery?.slug) {
      setQueryParam("gallery", initialGallery.slug);
    }

    renderHero();
    renderSelect();
    renderGalleryCards();
    renderImageGrid();
    bindEvents();
  } catch (error) {
    console.error(error);

    els.heroTitle.textContent = "Could not load archive";
    els.heroText.textContent = error.message || "Unknown error";
    els.galleryCards.innerHTML = `<div class="error-state">Failed to load generated/gallery-index.json</div>`;
    els.imageGridContainer.innerHTML = `<div class="error-state">Check the generated file path and deployment output.</div>`;
  }
}

init();
