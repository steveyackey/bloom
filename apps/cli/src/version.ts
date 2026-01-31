// Version is embedded at build time from package.json
// release-please updates package.json, so this stays in sync

import pkg from "../package.json";

export const VERSION = pkg.version;
