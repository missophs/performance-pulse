// Next resolves "@/lib/x" through jsconfig paths; plain `node --test` doesn't.
// This hook teaches node the same mapping so tests can import the real modules
// instead of a copy of them. Loaded via --import from the "test" npm script.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(import.meta.dirname);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(join(ROOT, specifier.slice(2) + ".js")).href, context);
    }
    return nextResolve(specifier, context);
  },
});
