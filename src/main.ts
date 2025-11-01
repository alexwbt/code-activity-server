import run from "./app";
import { getEnvNumber, getEnvString } from "./lib/common/env";

run({
  port: getEnvNumber("PORT", 3000),
  contextPath: getEnvString("CONTEXT_PATH", "/"),
});
