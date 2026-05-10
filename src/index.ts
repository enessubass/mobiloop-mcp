#!/usr/bin/env node
import { runAndExitOnError } from "./server.js";
import { allTools } from "./tools/index.js";

runAndExitOnError("mobiloop-mcp", allTools());
