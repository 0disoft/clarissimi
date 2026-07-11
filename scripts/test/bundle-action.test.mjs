import assert from "node:assert/strict";
import test from "node:test";

import { addNoticeAfterShebang } from "../bundle-action.mjs";

test("bundle notice preserves a Node shebang as the first line", () => {
  assert.equal(
    addNoticeAfterShebang("#!/usr/bin/env node\nconsole.log('ok');\n", "// generated\n"),
    "#!/usr/bin/env node\n// generated\nconsole.log('ok');\n",
  );
});

test("bundle notice prefixes output without a shebang", () => {
  assert.equal(
    addNoticeAfterShebang("console.log('ok');\n", "// generated\n"),
    "// generated\nconsole.log('ok');\n",
  );
});
