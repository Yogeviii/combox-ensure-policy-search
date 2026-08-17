(() => {
  "use strict";

  const UNIQUE_ID_SELECTOR = "#unique_id";
  const BUTTON_HOST_ID = "combox-ensure-policy-search";
  const CLAIMS_BUTTON_ID = "combox-ensure-claims-search";

  let placementScheduled = false;
  let resetTimer = null;

  function getMemberNumber() {
    const input = document.querySelector(UNIQUE_ID_SELECTOR);
    return input instanceof HTMLInputElement ? input.value.trim() : "";
  }

  function setStatus(button, status, message) {
    const host = document.getElementById(BUTTON_HOST_ID);
    const statusElement = host?.querySelector(".ensure-search-status");

    if (status === "working") {
      window.clearTimeout(resetTimer);
    }

    button.dataset.state = status;
    button.disabled = status === "working";
    button.textContent = status === "working"
      ? button.dataset.workingLabel
      : status === "success"
        ? button.dataset.successLabel
        : button.dataset.idleLabel;

    if (statusElement) {
      statusElement.textContent = message || "";
      statusElement.dataset.state = status;
      statusElement.hidden = !message;
    }
  }

  function scheduleReset(button, delay = 2200) {
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      if (button.isConnected) {
        setStatus(button, "idle", "");
      }
    }, delay);
  }

  async function searchClaims(button) {
    const memberNumber = getMemberNumber();

    if (!memberNumber) {
      setStatus(button, "error", "Unique ID is empty.");
      scheduleReset(button, 3500);
      return;
    }

    setStatus(button, "working", `Opening Claims Inbox for ${memberNumber}...`);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "SEARCH_ENSURE_CLAIMS",
        memberNumber
      });

      if (!response?.ok) {
        throw new Error(response?.error || "The Claims search could not be completed.");
      }

      setStatus(button, "success", `Claims search started for ${memberNumber}.`);
      scheduleReset(button);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(button, "error", message);
      scheduleReset(button, 6000);
    }
  }

  function createClaimsButton() {
    const button = document.createElement("button");
    button.id = CLAIMS_BUTTON_ID;
    button.type = "button";
    button.className = "ensure-search-button ensure-claims-button";
    button.textContent = "Claims";
    button.title = "Search the Claims Inbox using this conversation's Unique ID";
    button.setAttribute("aria-label", "Search this member in the eNsure Claims Inbox");
    button.dataset.state = "idle";
    button.dataset.idleLabel = "Claims";
    button.dataset.workingLabel = "Opening Claims...";
    button.dataset.successLabel = "Claims search opened (done)";
    button.addEventListener("click", () => searchClaims(button));
    return button;
  }

  function ensureClaimsButtonPlacement() {
    placementScheduled = false;

    const host = document.getElementById(BUTTON_HOST_ID);
    if (!host || document.getElementById(CLAIMS_BUTTON_ID)) {
      return;
    }

    const status = host.querySelector(".ensure-search-status");
    host.insertBefore(createClaimsButton(), status || null);
  }

  function scheduleClaimsButtonPlacement() {
    if (placementScheduled) {
      return;
    }

    placementScheduled = true;
    window.requestAnimationFrame(ensureClaimsButtonPlacement);
  }

  const observer = new MutationObserver(scheduleClaimsButtonPlacement);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("pageshow", scheduleClaimsButtonPlacement);
  window.addEventListener("popstate", scheduleClaimsButtonPlacement);
  scheduleClaimsButtonPlacement();
})();
