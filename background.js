"use strict";

const ENSURE_TAB_PATTERN = "https://ds-ensure01.passportcard.com/*";
const ENSURE_DEFAULT_PAGE = "/Web_Erp/code/Tabs/Default.aspx";
const ENSURE_CASE_PAGE = "https://ds-ensure01.passportcard.com/Web_Erp/Code/Cases/caseEdit.aspx";
const PROBE_ATTEMPTS = 24;
const PROBE_DELAY_MS = 250;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let operation;

  if (message?.type === "SEARCH_ENSURE_POLICY") {
    operation = searchEnsure(String(message.policyNumber ?? ""));
  } else if (message?.type === "OPEN_ENSURE_CASE") {
    operation = openEnsureCase(
      String(message.customerId ?? ""),
      Number(message.ensureWindowId)
    );
  } else {
    return false;
  }

  operation
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function searchEnsure(rawPolicyNumber) {
  const policyNumber = rawPolicyNumber.trim();

  if (!policyNumber) {
    return { ok: false, error: "The Commbox Unique ID is empty." };
  }

  if (policyNumber.length > 50) {
    return { ok: false, error: "The Commbox Unique ID is too long." };
  }

  const matchingTabs = await chrome.tabs.query({ url: ENSURE_TAB_PATTERN });

  if (!matchingTabs.length) {
    return {
      ok: false,
      error: "No open eNsure tab was found. Open eNsure and try again."
    };
  }

  const orderedTabs = matchingTabs
    .filter((tab) => Number.isInteger(tab.id))
    .sort((left, right) => tabPriority(right) - tabPriority(left));

  let lastProblem = "The eNsure search controls were not found.";

  for (const tab of orderedTabs) {
    try {
      await focusTab(tab);

      const newTabFrame = await findNewTabFrame(tab.id);

      if (!newTabFrame) {
        lastProblem = "The eNsure New Tab (+) control was not found.";
        continue;
      }

      const newTabExecution = await chrome.scripting.executeScript({
        target: {
          tabId: tab.id,
          frameIds: [newTabFrame.frameId]
        },
        world: "MAIN",
        func: openEmptyEnsureTab
      });

      const newTabResult = newTabExecution[0]?.result;

      if (!newTabResult?.ok) {
        lastProblem = newTabResult?.error || "eNsure rejected the New Tab (+) action.";
        continue;
      }

      const targetFrame = await findSearchFrame(tab.id);

      if (!targetFrame) {
        lastProblem = "The Policy#, QSearch, and magnifying-glass controls were not found in the eNsure tab.";
        continue;
      }

      const execution = await chrome.scripting.executeScript({
        target: {
          tabId: tab.id,
          frameIds: [targetFrame.frameId]
        },
        func: performPolicySearch,
        args: [policyNumber]
      });

      const result = execution[0]?.result;

      if (!result?.ok) {
        lastProblem = result?.error || "eNsure rejected the search action.";
        continue;
      }

      const customerId = await findCurrentCustomerId(tab.id, policyNumber);

      if (!customerId) {
        return {
          ok: false,
          error: "The customer opened, but its Customer ID could not be read."
        };
      }

      return {
        ok: true,
        policyNumber,
        customerId,
        tabId: tab.id,
        windowId: tab.windowId
      };
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
  }

  return { ok: false, error: lastProblem };
}

async function openEnsureCase(rawCustomerId, ensureWindowId) {
  const customerId = rawCustomerId.trim();

  if (!/^\d{1,20}$/.test(customerId)) {
    return { ok: false, error: "A valid saved eNsure Customer ID was not found." };
  }

  if (!Number.isInteger(ensureWindowId)) {
    return { ok: false, error: "The eNsure browser window was not saved." };
  }

  const ensureTabs = await chrome.tabs.query({
    windowId: ensureWindowId,
    url: ENSURE_TAB_PATTERN
  });

  if (!ensureTabs.length) {
    return {
      ok: false,
      error: "The eNsure browser window is no longer open. Search the policy again."
    };
  }

  const caseUrl = new URL(ENSURE_CASE_PAGE);
  caseUrl.searchParams.set("fromCases", "true");
  caseUrl.searchParams.set("ObjectTypeId", "1");
  caseUrl.searchParams.set("ObjectId", customerId);

  const openedTab = await chrome.tabs.create({
    windowId: ensureWindowId,
    url: caseUrl.href,
    active: true
  });

  await chrome.windows.update(ensureWindowId, { focused: true });

  return {
    ok: true,
    tabId: openedTab.id
  };
}

function tabPriority(tab) {
  const url = tab.url || "";
  const isDefaultPage = url.toLowerCase().includes(ENSURE_DEFAULT_PAGE.toLowerCase());
  const defaultPageScore = isDefaultPage ? 2_000_000_000_000_000 : 0;
  const activeScore = tab.active ? 1_000_000_000_000_000 : 0;
  return defaultPageScore + activeScore + (tab.lastAccessed || 0);
}

async function findNewTabFrame(tabId) {
  let lastProblem = null;

  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    try {
      const executions = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: inspectNewTabControl
      });

      const readyFrame = executions.find((entry) => entry.result?.ready);
      if (readyFrame) {
        return { frameId: readyFrame.frameId };
      }
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }

    await delay(PROBE_DELAY_MS);
  }

  if (lastProblem) {
    throw new Error(lastProblem);
  }

  return null;
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });

  if (Number.isInteger(tab.windowId)) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function findSearchFrame(tabId) {
  let lastPartialResult = null;

  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    try {
      const executions = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: inspectSearchControls
      });

      const readyFrame = executions.find((entry) => entry.result?.ready);
      if (readyFrame) {
        return { frameId: readyFrame.frameId };
      }

      lastPartialResult = executions.find((entry) => entry.result?.foundAny)?.result || null;
    } catch (error) {
      lastPartialResult = {
        error: error instanceof Error ? error.message : String(error)
      };
    }

    await delay(PROBE_DELAY_MS);
  }

  if (lastPartialResult?.error) {
    throw new Error(lastPartialResult.error);
  }

  return null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findCurrentCustomerId(tabId, policyNumber) {
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    try {
      const executions = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: inspectCurrentCustomerContext,
        args: [policyNumber]
      });

      const visibleContexts = executions
        .map((entry) => entry.result)
        .filter((result) => result?.visible);
      const policyIsVisible = visibleContexts.some((result) => result.hasPolicyNumber);

      if (!policyIsVisible) {
        await delay(PROBE_DELAY_MS);
        continue;
      }

      const sameFrameMatch = visibleContexts.find(
        (result) => result.hasPolicyNumber && result.customerId
      );
      if (sameFrameMatch) {
        return sameFrameMatch.customerId;
      }

      const customerIds = Array.from(new Set(
        visibleContexts
          .map((result) => result.customerId)
          .filter(Boolean)
      ));

      if (customerIds.length === 1) {
        return customerIds[0];
      }
    } catch (_error) {
      // A frame can be replaced while eNsure loads the searched customer.
    }

    await delay(PROBE_DELAY_MS);
  }

  return null;
}

function inspectCurrentCustomerContext(policyNumber) {
  function isCurrentFrameVisible() {
    try {
      let currentWindow = window;

      while (currentWindow !== currentWindow.top) {
        const frameElement = currentWindow.frameElement;
        if (!frameElement) {
          return false;
        }

        const frameStyle = currentWindow.parent.getComputedStyle(frameElement);
        const frameRect = frameElement.getBoundingClientRect();

        if (
          frameStyle.display === "none" ||
          frameStyle.visibility === "hidden" ||
          frameRect.width === 0 ||
          frameRect.height === 0
        ) {
          return false;
        }

        currentWindow = currentWindow.parent;
      }

      return true;
    } catch (_error) {
      return false;
    }
  }

  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  }

  if (!isCurrentFrameVisible()) {
    return { visible: false };
  }

  const pageText = document.body?.innerText || "";
  const escapedPolicyNumber = policyNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const policyPattern = new RegExp(`(^|\\D)${escapedPolicyNumber}(?=\\D|$)`);
  const context = {
    visible: true,
    hasPolicyNumber: policyPattern.test(pageText),
    customerId: null
  };

  const rows = Array.from(document.querySelectorAll("tr"));

  for (const row of rows) {
    if (!isElementVisible(row)) {
      continue;
    }

    const rowText = (row.innerText || row.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    const match = rowText.match(/(?:^|\s)Customer ID\s*:?\s*(\d{1,20})(?:\s|$)/i);

    if (match) {
      context.customerId = match[1];
      break;
    }
  }

  return context;
}

function inspectNewTabControl() {
  const newTabButton = document.querySelector('img[onclick*="AddTabClicked"]');

  function isCurrentFrameVisible() {
    try {
      let currentWindow = window;

      while (currentWindow !== currentWindow.top) {
        const frameElement = currentWindow.frameElement;
        if (!frameElement) {
          return false;
        }

        const frameStyle = currentWindow.parent.getComputedStyle(frameElement);
        const frameRect = frameElement.getBoundingClientRect();

        if (
          frameStyle.display === "none" ||
          frameStyle.visibility === "hidden" ||
          frameRect.width === 0 ||
          frameRect.height === 0
        ) {
          return false;
        }

        currentWindow = currentWindow.parent;
      }

      return true;
    } catch (_error) {
      return false;
    }
  }

  return {
    ready: (
      newTabButton instanceof HTMLElement &&
      newTabButton.getClientRects().length > 0 &&
      isCurrentFrameVisible()
    )
  };
}

function openEmptyEnsureTab() {
  const newTabButton = document.querySelector('img[onclick*="AddTabClicked"]');

  if (!(newTabButton instanceof HTMLElement)) {
    return { ok: false, error: "The eNsure New Tab (+) control was not found." };
  }

  try {
    if (typeof window.AddTabClicked === "function") {
      window.AddTabClicked();
      return { ok: true, method: "AddTabClicked" };
    }

    newTabButton.click();
    return { ok: true, method: "element.click" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function inspectSearchControls() {
  const searchType = document.querySelector("#Search_Type");
  const searchInput = document.querySelector("#QSearch");
  const searchButton = document.querySelector('img[onclick*="GQSearch"]');

  return {
    ready: Boolean(searchType && searchInput && searchButton),
    foundAny: Boolean(searchType || searchInput || searchButton),
    hasSearchType: Boolean(searchType),
    hasSearchInput: Boolean(searchInput),
    hasSearchButton: Boolean(searchButton)
  };
}

function performPolicySearch(policyNumber) {
  const searchType = document.querySelector("#Search_Type");
  const searchInput = document.querySelector("#QSearch");
  const searchButton = document.querySelector('img[onclick*="GQSearch"]');

  if (!(searchType instanceof HTMLSelectElement)) {
    return { ok: false, error: "The eNsure Policy# dropdown was not found." };
  }

  if (!(searchInput instanceof HTMLInputElement)) {
    return { ok: false, error: "The eNsure policy-number input was not found." };
  }

  if (!(searchButton instanceof HTMLElement)) {
    return { ok: false, error: "The eNsure magnifying-glass button was not found." };
  }

  try {
    const selectValueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    const inputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    if (selectValueSetter) {
      selectValueSetter.call(searchType, "PolicyNumber");
    } else {
      searchType.value = "PolicyNumber";
    }

    searchType.dispatchEvent(new Event("input", { bubbles: true }));
    searchType.dispatchEvent(new Event("change", { bubbles: true }));

    if (inputValueSetter) {
      inputValueSetter.call(searchInput, policyNumber);
    } else {
      searchInput.value = policyNumber;
    }

    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    searchInput.focus();

    searchButton.click();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
