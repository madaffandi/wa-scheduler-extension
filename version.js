(() => {
  const version = document.getElementById("version");
  if (version) {
    const manifest = chrome.runtime.getManifest();
    version.textContent = `@${manifest.author} | v${manifest.version}`;
  }
})();
