# Chrome Web Store Release Notes

## 1.0.8 - 2026-06-09

Scheduled sending is more reliable in the background, completed jobs are cleaned up automatically, and extension icons now load correctly.

- Injects the WhatsApp content script before sending so scheduled jobs work even when the popup is closed.
- Preserves multiline Unicode messages, including emoji and blank lines, when sending to WhatsApp.
- Removes successfully executed jobs from the job list.
- Adds manifest icon declarations so Chrome uses the bundled extension icon.

