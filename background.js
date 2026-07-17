"use strict";

const ENSURE_TAB_PATTERN = "https://ds-ensure01.passportcard.com/*";
const ENSURE_DEFAULT_PAGE = "/Web_Erp/code/Tabs/Default.aspx";
const PROBE_ATTEMPTS = 24;
const PROBE_DELAY_MS = 250;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SEARCH_ENSURE_POLICY") {
    return false;
  }

  searchEnsure(String(message.policyNumber ?? ""))
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

      return {
        ok: true,
        policyNumber,
        tabId: tab.id
      };
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
  }

  return { ok: false, error: lastProblem };
}

function tabPriority(tab) {
  const url = tab.url || "";
  const isDefaultPage = url.toLowerCase().includes(ENSURE_DEFAULT_PAGE.toLowerCase());
  const defaultPageScore = isDefaultPage ? 2_000_000_000_000_000 : 0;
  const activeScore = tab.active ? 1_000_000_000_000_000 : 0;
  return defaultPageScore + activeScore + (tab.lastAccessed || 0);
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
