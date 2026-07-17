(() => {
  "use strict";

  const UNIQUE_ID_SELECTOR = "#unique_id";
  const UNIQUE_ID_WRAPPER_SELECTOR = "#unique_id_wrapper";
  const BUTTON_HOST_ID = "combox-ensure-policy-search";

  let boundUniqueIdInput = null;
  let placementScheduled = false;
  let resetTimer = null;

  function getPolicyNumber() {
    const input = document.querySelector(UNIQUE_ID_SELECTOR);
    return input instanceof HTMLInputElement ? input.value.trim() : "";
  }

  function setStatus(button, status, message) {
    const host = document.getElementById(BUTTON_HOST_ID);
    const statusElement = host?.querySelector(".ensure-search-status");

    button.dataset.state = status;
    button.disabled = status === "working";

    if (status === "working") {
      button.textContent = "Searching...";
    } else if (status === "success") {
      button.textContent = "Opened in eNsure (done)";
    } else {
      button.textContent = "Search in eNsure";
    }

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

  async function searchInEnsure(button) {
    const policyNumber = getPolicyNumber();

    if (!policyNumber) {
      setStatus(button, "error", "Unique ID is empty.");
      scheduleReset(button, 3500);
      return;
    }

    setStatus(button, "working", `Searching for ${policyNumber}...`);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "SEARCH_ENSURE_POLICY",
        policyNumber
      });

      if (!response?.ok) {
        throw new Error(response?.error || "The search could not be completed.");
      }

      setStatus(button, "success", `Policy ${policyNumber} was sent to eNsure.`);
      scheduleReset(button);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(button, "error", message);
      scheduleReset(button, 6000);
    }
  }

  function createButtonHost() {
    const host = document.createElement("span");
    host.id = BUTTON_HOST_ID;
    host.className = "ensure-search-host";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ensure-search-button";
    button.textContent = "Search in eNsure";
    button.title = "Search this conversation's Unique ID as a policy number in eNsure";
    button.setAttribute("aria-label", "Search this policy in eNsure");
    button.dataset.state = "idle";
    button.addEventListener("click", () => searchInEnsure(button));

    const status = document.createElement("span");
    status.className = "ensure-search-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;

    host.append(button, status);
    return host;
  }

  function ensureButtonPlacement() {
    placementScheduled = false;

    const uniqueIdInput = document.querySelector(UNIQUE_ID_SELECTOR);
    const existingHost = document.getElementById(BUTTON_HOST_ID);

    if (!(uniqueIdInput instanceof HTMLInputElement)) {
      existingHost?.remove();
      boundUniqueIdInput = null;
      return;
    }

    if (existingHost?.isConnected && boundUniqueIdInput === uniqueIdInput) {
      return;
    }

    existingHost?.remove();

    const anchor = uniqueIdInput.closest(UNIQUE_ID_WRAPPER_SELECTOR) || uniqueIdInput;
    anchor.insertAdjacentElement("afterend", createButtonHost());
    boundUniqueIdInput = uniqueIdInput;
  }

  function scheduleButtonPlacement() {
    if (placementScheduled) {
      return;
    }

    placementScheduled = true;
    window.requestAnimationFrame(ensureButtonPlacement);
  }

  const observer = new MutationObserver(scheduleButtonPlacement);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("pageshow", scheduleButtonPlacement);
  window.addEventListener("popstate", scheduleButtonPlacement);
  scheduleButtonPlacement();
})();
