#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { orchestratorTools } from "../tools/orchestrator.js";

runAndExitOnError("mobiloop-orchestrator-mcp", orchestratorTools());
