// background.js

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "lookup-selection") {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return;

    chrome.tabs.sendMessage(
      tab.id,
      { type: "GET_SELECTION" },
      async (response) => {
        const selectedText = (response && response.text) || "";

        await chrome.storage.local.set({
          lastSelection: selectedText,
          autoLookup: true
        });

        try {
          if (chrome.action && chrome.action.openPopup) {
            await chrome.action.openPopup();
          }
        } catch (e) {
          console.warn("Could not open popup automatically:", e);
        }
      }
    );
  }
});
