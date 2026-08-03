(() => {
  "use strict";

  const UNIQUE_ID_SELECTOR = "#unique_id";
  const UNIQUE_ID_WRAPPER_SELECTOR = "#unique_id_wrapper";
  const BUTTON_HOST_ID = "combox-ensure-policy-search";

  let boundUniqueIdInput = null;
  let placementScheduled = false;
  let resetTimer = null;
  const customerIdsByPolicyNumber = new Map();

  function getPolicyNumber() {
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

    const idleLabel = button.dataset.idleLabel || "Search in eNsure";
    const workingLabel = button.dataset.workingLabel || idleLabel;
    const successLabel = button.dataset.successLabel || idleLabel;

    button.textContent = status === "working"
      ? workingLabel
      : status === "success"
        ? successLabel
        : idleLabel;

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

      if (!/^\d{1,20}$/.test(String(response.customerId ?? ""))) {
        throw new Error("The eNsure customer opened, but its Customer ID was not captured.");
      }

      if (!Number.isInteger(response.windowId)) {
        throw new Error("The eNsure browser window could not be identified.");
      }

      customerIdsByPolicyNumber.set(policyNumber, {
        customerId: String(response.customerId),
        ensureWindowId: response.windowId
      });

      setStatus(button, "success", `Policy ${policyNumber} is ready for case creation.`);
      scheduleReset(button);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(button, "error", message);
      scheduleReset(button, 6000);
    }
  }

  async function openCaseInEnsure(button) {
    const policyNumber = getPolicyNumber();
    const customerContext = customerIdsByPolicyNumber.get(policyNumber);

    if (!policyNumber || !customerContext) {
      setStatus(button, "error", "Search this policy in eNsure first.");
      scheduleReset(button, 5000);
      return;
    }

    setStatus(button, "working", "Opening a new case tab...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "OPEN_ENSURE_CASE",
        customerId: customerContext.customerId,
        ensureWindowId: customerContext.ensureWindowId
      });

      if (!response?.ok) {
        throw new Error(response?.error || "The case tab could not be opened.");
      }

      setStatus(button, "success", "New case opened in a separate tab.");
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

    const searchButton = document.createElement("button");
    searchButton.type = "button";
    searchButton.className = "ensure-search-button";
    searchButton.textContent = "Search in eNsure";
    searchButton.title = "Search this conversation's Unique ID as a policy number in eNsure";
    searchButton.setAttribute("aria-label", "Search this policy in eNsure");
    searchButton.dataset.state = "idle";
    searchButton.dataset.idleLabel = "Search in eNsure";
    searchButton.dataset.workingLabel = "Searching...";
    searchButton.dataset.successLabel = "Opened in eNsure (done)";
    searchButton.addEventListener("click", () => searchInEnsure(searchButton));

    const caseButton = document.createElement("button");
    caseButton.type = "button";
    caseButton.className = "ensure-search-button ensure-case-button";
    caseButton.textContent = "Create Case in eNsure";
    caseButton.title = "Open a new case for the customer found by the policy search";
    caseButton.setAttribute("aria-label", "Create a case for this customer in eNsure");
    caseButton.dataset.state = "idle";
    caseButton.dataset.idleLabel = "Create Case in eNsure";
    caseButton.dataset.workingLabel = "Opening case...";
    caseButton.dataset.successLabel = "Case opened (done)";
    caseButton.addEventListener("click", () => openCaseInEnsure(caseButton));

    const status = document.createElement("span");
    status.className = "ensure-search-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;

    host.append(searchButton, caseButton, status);
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
