#!/usr/bin/env node
import { runAndExitOnError } from "../server.js";
import { deviceTools } from "../tools/device.js";

runAndExitOnError("mobiloop-device-mcp", deviceTools());
