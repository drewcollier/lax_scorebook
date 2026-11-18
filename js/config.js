// js/config.js - settings shared by the scorebook (index.html) and the stats viewer (viewer.html).

// The team's Apps Script web-app link (Apps Script: Deploy > Manage deployments > Web app URL).
// Built in so nobody has to paste it. Settings > Google Apps Script URL can override it on one
// device. It only changes if a NEW deployment is ever created (updating with "New version"
// keeps it). It's safe in this public code: every request also needs the PIN.
var DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxd7sWlkDhDcL4Sgs01lspwPrBOBodRsyH3hfJ5CHXWvZWffzYgrPnFbhu8oQpG6-Sn3g/exec';
