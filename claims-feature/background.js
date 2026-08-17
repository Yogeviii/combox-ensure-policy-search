(() => {
  "use strict";

  const ENSURE_TAB_PATTERN = "https://ds-ensure01.passportcard.com/*";
  const ENSURE_DEFAULT_PAGE = "/Web_Erp/code/Tabs/Default.aspx";
  const PROBE_ATTEMPTS = 40;
  const PROBE_DELAY_MS = 250;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SEARCH_ENSURE_CLAIMS") {
      return false;
    }

    searchEnsureClaims(String(message.memberNumber ?? ""))
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return true;
  });

  async function searchEnsureClaims(rawMemberNumber) {
    const memberNumber = rawMemberNumber.trim();

    if (!memberNumber) {
      return { ok: false, error: "The Commbox Unique ID is empty." };
    }

    if (!/^\d{1,50}$/.test(memberNumber)) {
      return {
        ok: false,
        error: "The Unique ID must contain digits only and be no longer than 50 digits."
      };
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

    let lastProblem = "The eNsure Claims controls were not found.";

    for (const tab of orderedTabs) {
      try {
        await focusTab(tab);

        const claimsFrame = await findVisibleElementFrame(
          tab.id,
          "#TabControllerTab8"
        );

        if (!claimsFrame) {
          lastProblem = "The eNsure Claims tab was not found.";
          continue;
        }

        await clickElementInFrame(
          tab.id,
          claimsFrame.frameId,
          "#TabControllerTab8",
          "The eNsure Claims tab could not be clicked."
        );

        const inboxFrame = await findVisibleElementFrame(tab.id, "#Tab_Inbox");

        if (!inboxFrame) {
          lastProblem = "The Claims Inbox tab was not found.";
          continue;
        }

        await clickElementInFrame(
          tab.id,
          inboxFrame.frameId,
          "#Tab_Inbox",
          "The Claims Inbox tab could not be clicked."
        );

        const searchFrame = await findClaimsSearchFrame(tab.id);

        if (!searchFrame) {
          lastProblem = "The Claims Member # field and Search button were not found.";
          continue;
        }

        const execution = await chrome.scripting.executeScript({
          target: {
            tabId: tab.id,
            frameIds: [searchFrame.frameId]
          },
          func: performClaimsSearch,
          args: [memberNumber]
        });

        const result = execution[0]?.result;

        if (!result?.ok) {
          lastProblem = result?.error || "eNsure rejected the Claims search.";
          continue;
        }

        return {
          ok: true,
          memberNumber,
          tabId: tab.id,
          windowId: tab.windowId
        };
      } catch (error) {
        lastProblem = error instanceof Error ? error.message : String(error);
      }
    }

    return { ok: false, error: lastProblem };
  }

  function tabPriority(tab) {
    const url = tab.url || "";
    const isDefaultPage = url
      .toLowerCase()
      .includes(ENSURE_DEFAULT_PAGE.toLowerCase());
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

  async function findVisibleElementFrame(tabId, selector) {
    return findFrame(tabId, inspectVisibleElement, [selector]);
  }

  async function findClaimsSearchFrame(tabId) {
    return findFrame(tabId, inspectClaimsSearchControls, []);
  }

  async function findFrame(tabId, inspector, args) {
    let lastProblem = null;

    for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
      try {
        const executions = await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: inspector,
          args
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

  async function clickElementInFrame(
    tabId,
    frameId,
    selector,
    fallbackError
  ) {
    const execution = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: clickElement,
      args: [selector, fallbackError]
    });

    const result = execution[0]?.result;

    if (!result?.ok) {
      throw new Error(result?.error || fallbackError);
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function inspectVisibleElement(selector) {
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

    const element = document.querySelector(selector);

    return {
      ready: Boolean(
        element instanceof HTMLElement &&
        element.getClientRects().length > 0 &&
        window.getComputedStyle(element).visibility !== "hidden" &&
        isCurrentFrameVisible()
      )
    };
  }

  function inspectClaimsSearchControls() {
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

    function isVisible(element) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0
      );
    }

    const memberInput = document.querySelector("#policynumber");
    const searchButton = document.querySelector("#BtnUpd");

    return {
      ready: Boolean(
        memberInput instanceof HTMLInputElement &&
        searchButton instanceof HTMLInputElement &&
        isVisible(memberInput) &&
        isVisible(searchButton) &&
        isCurrentFrameVisible()
      )
    };
  }

  function clickElement(selector, fallbackError) {
    const element = document.querySelector(selector);

    if (!(element instanceof HTMLElement)) {
      return { ok: false, error: fallbackError };
    }

    try {
      element.click();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : fallbackError
      };
    }
  }

  function performClaimsSearch(memberNumber) {
    const memberInput = document.querySelector("#policynumber");
    const searchButton = document.querySelector("#BtnUpd");

    if (!(memberInput instanceof HTMLInputElement)) {
      return { ok: false, error: "The Claims Member # field was not found." };
    }

    if (!(searchButton instanceof HTMLInputElement)) {
      return { ok: false, error: "The Claims Search button was not found." };
    }

    try {
      const inputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;

      if (inputValueSetter) {
        inputValueSetter.call(memberInput, memberNumber);
      } else {
        memberInput.value = memberNumber;
      }

      memberInput.dispatchEvent(new Event("input", { bubbles: true }));
      memberInput.dispatchEvent(new Event("change", { bubbles: true }));
      memberInput.focus();
      searchButton.click();

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
})();
