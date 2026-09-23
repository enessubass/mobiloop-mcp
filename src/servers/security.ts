#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { securityTools } from "../tools/security.js";

runAndExitOnError("mobiloop-security-mcp", securityTools());
