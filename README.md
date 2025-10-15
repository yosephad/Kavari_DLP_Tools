# DLP Mail Blocker - quick install

## Load extension (Chrome / Edge)

1. Open chrome://extensions (atau edge://extensions)
2. Enable "Developer mode"
3. Click "Load unpacked" and pilih folder `dlp-mail-blocker/`
4. Open Gmail (https://mail.google.com/) atau Outlook Web (https://outlook.office.com/)
5. Open popup (extension icon) for activating / see event log 
6. Settings available on Options Page.

## Load in Firefox

Firefox supports MV3 since recent versions; go to about:debugging#/runtime/this-firefox -> "Load Temporary Add-on" and choose file `manifest.json` (or zip folder contents).

## Testing

- Compose email to `yourname@gmail.com` or other personal domain and include text `1234567890123456` (16 digits) in body. Click send -> pop-up modal should block.
- Check popup "Recent Events" to see logged event.

## Notes

- Regexes & personal domain lists are configurable via Options.
- By default extension does not exfiltrate any data to outside.
