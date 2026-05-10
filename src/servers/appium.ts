#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { appiumTools } from "../tools/appium.js";

runAndExitOnError("mobiloop-appium-mcp", appiumTools());
