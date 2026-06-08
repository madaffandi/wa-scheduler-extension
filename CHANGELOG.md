# Changelog

## 1.0.8 - 2026-06-09

- Inject the WhatsApp content script before sending so scheduled jobs still work when the popup is closed or the WhatsApp tab was opened before the extension reload.
- Delete successfully executed jobs automatically and clean up older executed jobs from storage.
- Declare extension and toolbar icons in the manifest so Chrome uses the bundled icon files instead of the generated letter tile.

