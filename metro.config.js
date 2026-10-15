const http = require("http");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a .wasm file and needs SharedArrayBuffer, so the page itself must be cross-origin isolated.
config.resolver.assetExts.push("wasm");

// Expo serves the HTML before Metro's middleware runs, so server.enhanceMiddleware never sees it; set the headers on every dev response.
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, res) {
  if (event === "request") {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  }
  return emit.apply(this, arguments);
};

module.exports = config;
