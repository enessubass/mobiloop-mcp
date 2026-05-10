#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { envTools } from "../tools/env.js";

runAndExitOnError("mobiloop-env-mcp", envTools());
