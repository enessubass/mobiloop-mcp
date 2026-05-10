#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { verifyTools } from "../tools/verify.js";

runAndExitOnError("mobiloop-verify-mcp", verifyTools());
