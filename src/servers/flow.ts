#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { flowTools } from "../tools/flow.js";

runAndExitOnError("mobiloop-flow-mcp", flowTools());
