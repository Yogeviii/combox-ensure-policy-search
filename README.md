# Commbox to eNsure Policy Search

This local Chrome extension adds a **Search in eNsure** button next to the
Commbox conversation's **Unique ID**. Clicking it finds the already-open eNsure
tab, selects **Policy#**, fills the Unique ID into the policy search field, and
clicks the magnifying glass.

No policy numbers are stored or sent anywhere by the extension. They are passed
locally from the Commbox tab to the eNsure tab.

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
4. The extension activates eNsure, fills the policy number, and starts the
   search.

The button is automatically restored when Commbox replaces the conversation
panel dynamically. The eNsure search also checks all frames, so the controls can
be located if the CRM places them inside an iframe.

## Troubleshooting

- **No open eNsure tab was found:** Open eNsure at
  `https://ds-ensure01.passportcard.com/Web_Erp/code/Tabs/Default.aspx`, log in,
  and try again.
- **Search controls were not found:** Confirm the eNsure page has finished
  loading and that the Policy# search bar is visible, then try again.
- **No button in Commbox:** Expand the conversation's Details section and check
  that Unique ID is visible. Refresh Commbox after installing or reloading the
  extension.
- **After changing extension files:** Use the reload button on
  `chrome://extensions`, then refresh Commbox.
