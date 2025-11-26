// content.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SELECTION") {
    let selectedText = window.getSelection().toString().trim();

    // handle inputs / textareas
    if (!selectedText) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        selectedText = active.value.substring(
          active.selectionStart || 0,
          active.selectionEnd || 0
        ).trim();
      }
    }

    sendResponse({ text: selectedText || "" });
  }

  return false;
});
