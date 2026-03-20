// ============================
// CONFIG — PUT YOUR R2 URLS HERE
// ============================

const IMAGE_URLS = [
  // Example:
  // "https://your-r2-domain/page1.webp",
  // "https://your-r2-domain/page2.webp",
];


// ============================
// RENDER LOGIC
// ============================

const gallery = document.getElementById("gallery");

function createPage(url, index) {
  const page = document.createElement("div");
  page.className = "page";

  const viewer = document.createElement("div");
  viewer.className = "viewer";

  const img = document.createElement("img");
  img.src = url;
  img.alt = `Page ${index + 1}`;
  img.loading = "lazy";
  img.decoding = "async";

  // fallback text while loading
  const loading = document.createElement("div");
  loading.className = "loading";
  loading.textContent = "Loading…";

  viewer.appendChild(loading);
  viewer.appendChild(img);
  page.appendChild(viewer);

  // remove loading once image loads
  img.onload = () => {
    loading.remove();
  };

  img.onerror = () => {
    loading.textContent = "Failed to load image";
  };

  return page;
}

function renderGallery() {
  if (!IMAGE_URLS.length) {
    gallery.innerHTML = `
      <div class="loading">
        No images found.<br>
        Add your R2 URLs in <code>index.js</code>.
      </div>
    `;
    return;
  }

  gallery.innerHTML = "";

  IMAGE_URLS.forEach((url, index) => {
    const page = createPage(url, index);
    gallery.appendChild(page);
  });
}


// ============================
// INIT
// ============================

renderGallery();
