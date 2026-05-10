#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { ciTools } from "../tools/ci.js";

runAndExitOnError("mobiloop-ci-mcp", ciTools());
