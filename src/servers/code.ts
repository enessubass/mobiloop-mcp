#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { codeTools } from "../tools/code.js";

runAndExitOnError("mobiloop-code-mcp", codeTools());
