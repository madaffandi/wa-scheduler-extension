(() => {
  async function loadLatestRelease() {
    const response = await fetch(chrome.runtime.getURL("CHANGELOG.md"));
    if (!response.ok) throw new Error("Cannot load changelog.");

    return parseLatestRelease(await response.text());
  }

  function parseLatestRelease(markdown) {
    const lines = markdown.split(/\r?\n/);
    const headingIndex = lines.findIndex((line) => /^##\s+/.test(line));
    if (headingIndex === -1) return null;

    const heading = lines[headingIndex].replace(/^##\s+/, "").trim();
    const nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && /^##\s+/.test(line));
    const bodyLines = lines.slice(headingIndex + 1, nextHeadingIndex === -1 ? lines.length : nextHeadingIndex);
    const items = bodyLines
      .map((line) => line.match(/^-\s+(.+)/)?.[1])
      .filter(Boolean);

    const match = heading.match(/^(.+?)\s+-\s+(.+)$/);
    return {
      version: match ? match[1] : heading,
      date: match ? match[2] : "",
      items
    };
  }

  function renderLatestRelease(element, release) {
    if (!element || !release) return;

    const heading = document.createElement("h2");
    heading.textContent = `Latest Fixes v${release.version}`;

    const meta = document.createElement("p");
    meta.className = "muted release-date";
    meta.textContent = release.date;

    const list = document.createElement("ul");
    list.className = "release-list";

    release.items.forEach((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.appendChild(listItem);
    });

    element.replaceChildren(heading, meta, list);
  }

  async function init() {
    const targets = document.querySelectorAll("[data-latest-release]");
    if (targets.length === 0) return;

    try {
      const release = await loadLatestRelease();
      targets.forEach((target) => renderLatestRelease(target, release));
    } catch (error) {
      targets.forEach((target) => {
        target.textContent = error.message || String(error);
        target.className = "error";
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

