# Commbox to eNsure Policy Search

This local Chrome extension adds three buttons next to the Commbox
conversation's **Unique ID**:

- **Search in eNsure** finds the already-open eNsure browser tab, clicks
  eNsure's **New Tab (+)** control, selects **Policy#**, fills the Unique ID into
  the policy search field, and clicks the magnifying glass.
- **Create Case in eNsure** opens a new case for the customer found by the
  policy search in a separate browser tab in the same Chrome window as eNsure.
- **Claims** opens eNsure's **Claims** area, selects **Inbox**, fills the Unique
  ID into **Member #**, and starts the search.

Policy and customer IDs are kept only in memory in the current Commbox tab. They
are not sent outside Commbox and eNsure and are cleared when that tab closes or
reloads.

## Install

1. Extract the ZIP if you downloaded the packaged version.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `combox-ensure-policy-search` folder containing `manifest.json`.
6. Refresh the open Commbox page once after installing the extension.

Chrome must be allowed to run this extension on:

- `https://davidshield.commbox.io/*`
- `https://ds-ensure01.passportcard.com/*`

## Use

1. Keep eNsure open and logged in.
2. Open a conversation in Commbox and expand **Details** so the Unique ID field
   is present.
3. Click **Search in eNsure** next to the Unique ID.
4. The extension activates eNsure, opens a new empty internal tab, fills the
   policy number, starts the search, and privately remembers the opened
   customer's ID. Existing customer tabs remain open.
5. Back in Commbox, click **Create Case in eNsure** below the search button. The
   extension opens a new case for that saved customer in a separate browser tab
   in the eNsure Chrome window, not the Commbox window.

To search the Claims Inbox, click **Claims** in Commbox. This workflow is
independent of the policy-search and case-creation workflow and does not require
searching the policy first.

The button is automatically restored when Commbox replaces the conversation
panel dynamically. The eNsure search also checks all frames, so the controls can
be located if the CRM places them inside an iframe.

## Troubleshooting

- **No open eNsure tab was found:** Open eNsure at
  `https://ds-ensure01.passportcard.com/Web_Erp/code/Tabs/Default.aspx`, log in,
  and try again.
- **New Tab (+) or search controls were not found:** Confirm the eNsure page has
  finished loading and that the plus button and Policy# search bar are visible,
  then try again.
- **Search this policy in eNsure first:** The case button only uses the customer
  captured by the search button for the currently displayed Unique ID.
- **No button in Commbox:** Expand the conversation's Details section and check
  that Unique ID is visible. Refresh Commbox after installing or reloading the
  extension.
- **After changing extension files:** Use the reload button on
  `chrome://extensions`, then refresh Commbox.
