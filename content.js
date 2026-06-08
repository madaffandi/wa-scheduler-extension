(() => {
  if (window.__WA_SCHEDULER_CONTENT_LOADED__) return;
  window.__WA_SCHEDULER_CONTENT_LOADED__ = true;

  let sending = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "SEND_WHATSAPP_MESSAGE") return;

    (async () => {
      if (sending) throw new Error("Another WhatsApp send operation is still running.");
      sending = true;

      try {
        const { groupName, message: text } = message.payload;
        if (!groupName || !text) throw new Error("Recipient and message are required.");

        await waitForWhatsAppReady();
        await openChatByContactSearch(groupName);
        await typeAndSendMessage(text);
        sendResponse({ ok: true });
      } finally {
        sending = false;
      }
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  });

  async function waitForWhatsAppReady() {
    await waitFor(() => document.querySelector("#app"), 60000, "WhatsApp Web is not ready. Please log in first.");
    await waitFor(() => findContactSearchInput(), 60000, "Cannot find WhatsApp contact search input.");
  }

  async function openChatByContactSearch(chatName) {
    const normalizedChatName = normalize(chatName);

    const searchInput = await waitFor(
      () => findContactSearchInput(),
      15000,
      "Cannot find the left-side contact search input."
    );

    await setInputValue(searchInput, "");
    await sleep(150);
    await setInputValue(searchInput, chatName);
    await sleep(1200);

    const chatRow = await waitFor(
      () => findFirstSearchResultRow(normalizedChatName),
      15000,
      `Cannot find any WhatsApp chat/group from contact search: ${chatName}`
    );

    await clickSearchResultRow(chatRow);

    // Do not strictly verify the opened header title. WhatsApp search may return multiple
    // matching contacts/groups or display names differently. The requested behavior is:
    // search, open the first visible result, then send to that opened chat.
    await waitFor(() => findMessageBox(), 15000, "Clicked search result, but the chat message box did not open.");
    await sleep(500);
  }

  function findContactSearchInput() {
    // WhatsApp currently uses a normal <input>, not contenteditable, for the left sidebar search.
    // Avoid dynamic IDs like _r_a_; aria-label / placeholder / data-tab are more stable.
    const inputs = Array.from(document.querySelectorAll('input[role="textbox"], input[type="text"]'));

    return inputs.find((el) => {
      if (el.closest("footer")) return false;

      const label = normalize(el.getAttribute("aria-label") || "");
      const placeholder = normalize(el.getAttribute("placeholder") || "");
      const dataTab = el.getAttribute("data-tab") || "";

      return (
        label === "search or start a new chat" ||
        placeholder === "search or start a new chat" ||
        (dataTab === "3" && (label.includes("search") || placeholder.includes("search")))
      );
    }) || null;
  }

  function findFirstSearchResultRow(normalizedChatName) {
    // WhatsApp search result panel currently renders a section label as data-testid=list-item-0
    // and the first real chat result as data-testid=list-item-1. So prioritize list-item-1.
    const leftPane = document.querySelector('#pane-side') || document.querySelector('[aria-label="Chat list"]') || document.body;

    const firstRealResult = leftPane.querySelector('[data-testid="list-item-1"]');
    if (firstRealResult && isVisible(firstRealResult)) {
      return getClickableSearchResultTarget(firstRealResult);
    }

    // Fallback: collect list-item-N rows, skip list-item-0 because it is usually the "Chat" label.
    const testIdRows = Array.from(leftPane.querySelectorAll('[data-testid^="list-item-"]'))
      .filter(isVisible)
      .filter((row) => row.getAttribute('data-testid') !== 'list-item-0')
      .filter((row) => normalize(row.innerText || row.textContent || "").length > 0);

    const matchingTestIdRow = testIdRows.find((row) =>
      normalize(row.innerText || row.textContent || "").includes(normalizedChatName)
    );
    if (matchingTestIdRow || testIdRows[0]) return getClickableSearchResultTarget(matchingTestIdRow || testIdRows[0]);

    // Final fallback for future WhatsApp markup changes. Avoid label/search rows.
    const rows = Array.from(leftPane.querySelectorAll('[role="listitem"], [role="row"], div[tabindex="0"]'))
      .filter(isVisible)
      .filter((row) => !row.querySelector('input[aria-label="Search or start a new chat"]'))
      .filter((row) => !/^(chat|chats)$/i.test(normalize(row.innerText || row.textContent || "")))
      .filter((row) => normalize(row.innerText || row.textContent || "").length > 0);

    const matchingRow = rows.find((row) => normalize(row.innerText || row.textContent || "").includes(normalizedChatName));
    const result = matchingRow || rows[0] || null;
    return result ? getClickableSearchResultTarget(result) : null;
  }

  function getClickableSearchResultTarget(row) {
    // The virtualized wrapper with data-testid=list-item-1 may not receive the click.
    // The stable real card is usually cell-frame-container. For "message yourself",
    // WhatsApp sometimes uses message-yourself-row instead.
    const card =
      row.querySelector('[data-testid="cell-frame-container"]') ||
      row.querySelector('[data-testid="message-yourself-row"]') ||
      row.querySelector('[data-testid="cell-frame-title"]')?.closest('[data-testid="cell-frame-container"]') ||
      row.querySelector('[data-testid="cell-frame-title"]')?.closest('[role="gridcell"]') ||
      row.querySelector('[role="gridcell"][tabindex="0"]') ||
      row.querySelector('[role="gridcell"]') ||
      row.querySelector('[aria-selected]') ||
      row;

    return card;
  }

  async function clickSearchResultRow(target) {
    target.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(150);

    const candidates = [
      target,
      target.closest('[data-testid^="list-item-"]'),
      target.closest('[role="row"]'),
      target.closest('[role="gridcell"]')
    ].filter(Boolean);

    for (const el of [...new Set(candidates)]) {
      const rect = el.getBoundingClientRect();
      const x = rect.left + Math.min(Math.max(rect.width * 0.35, 40), rect.width - 10);
      const y = rect.top + rect.height / 2;

      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        }));
      }

      el.click?.();
      await sleep(350);
      if (findMessageBox()) return;
    }
  }

  async function typeAndSendMessage(text) {
    const messageBox = await waitFor(() => findMessageBox(), 10000, "Cannot find WhatsApp message input box.");
    await setEditableValue(messageBox, "");
    await sleep(100);
    await setEditableValue(messageBox, text);
    await sleep(300);

    const sendButton = await waitFor(() => findSendButton(), 7000, "Cannot find WhatsApp send button.");
    sendButton.click();
  }

  function findMessageBox() {
    const footer = document.querySelector("footer");
    if (!footer) return null;

    const boxes = Array.from(footer.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"]'));
    return boxes.find((el) => {
      const label = normalize(el.getAttribute("aria-label") || "");
      const placeholder = normalize(el.getAttribute("data-placeholder") || "");
      return label.includes("message") || placeholder.includes("message") || boxes.length === 1;
    }) || null;
  }

  function findSendButton() {
    return document.querySelector('footer button[aria-label="Send"], footer span[data-icon="send"]')?.closest("button") || null;
  }

  async function setInputValue(input, value) {
    input.focus();
    await sleep(100);

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    nativeInputValueSetter.call(input, value);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function setEditableValue(element, value) {
    element.focus();
    await sleep(100);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("delete", false, null);
    await sleep(50);

    if (value) {
      document.execCommand("insertText", false, value);
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function waitFor(condition, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const result = condition();
        if (result) {
          clearInterval(timer);
          resolve(result);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error(timeoutMessage));
        }
      }, 250);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
