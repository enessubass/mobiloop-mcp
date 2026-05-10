#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { loopTools } from "../tools/loop.js";

runAndExitOnError("mobiloop-loop-mcp", loopTools());
