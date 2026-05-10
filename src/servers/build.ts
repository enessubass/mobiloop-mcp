#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { buildTools } from "../tools/build.js";

runAndExitOnError("mobiloop-build-mcp", buildTools());
