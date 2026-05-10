#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { iosTools } from "../tools/ios.js";

runAndExitOnError("mobiloop-ios-mcp", iosTools());
