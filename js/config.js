// js/config.js - settings shared by the scorebook (index.html) and the stats viewer (viewer.html).

// The team's Apps Script web-app link (Apps Script: Deploy > Manage deployments > Web app URL).
// Built in so nobody has to paste it. Settings > Google Apps Script URL can override it on one
// device. It only changes if a NEW deployment is ever created (updating with "New version"
// keeps it). It's safe in this public code: every request also needs the PIN or a family sign-in.
var DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxd7sWlkDhDcL4Sgs01lspwPrBOBodRsyH3hfJ5CHXWvZWffzYgrPnFbhu8oQpG6-Sn3g/exec';

// The TEST copy's web app link (the app's Test mode sends games there).
// Leave '' until the TEST copy exists; Settings > Test mode can also take it.
var TEST_SCRIPT_URL = '';

// The family sign-up Google Form (shown on the viewer's sign-in screen). Leave '' to
// show "Ask the coach for the sign-up form" instead.
var SIGNUP_FORM_URL = 'https://forms.gle/JwJAM6w6zq8VPtK4A';
