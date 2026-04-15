const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Configuration: path to fm-manager.jar (default: project tools folder)
const FM_MANAGER_JAR =
  process.env.FM_MANAGER_JAR_PATH || path.join(__dirname, "fm-manager.jar");

function ensureFmDir() {
  const fmDir = path.join(os.homedir(), ".fm");
  if (!fs.existsSync(fmDir)) fs.mkdirSync(fmDir, { recursive: true });
  return fmDir;
}

app.post("/run-trades", async (req, res) => {
  try {
    const { marketplaceId, sessionId, token, username, password, account } =
      req.body || {};

    if (!marketplaceId || !sessionId) {
      return res
        .status(400)
        .json({ error: "marketplaceId and sessionId are required" });
    }

    // Prefer a repository-local credential file if present (tools/fm-proxy/credential).
    const localCredentialPath = path.join(__dirname, "credential");
    let credentialPath;

    if (fs.existsSync(localCredentialPath)) {
      console.log("Using local credential file at", localCredentialPath);
      credentialPath = localCredentialPath;
    } else {
      const fmDir = ensureFmDir();
      credentialPath = path.join(fmDir, "credential");

      // Create credential file in ~/.fm/credential
      let credentialContent;
      if (token) {
        credentialContent = `token=${token}`;
      } else if (username && password && account) {
        credentialContent = `account=${account}\nemail=${username}\npassword=${password}`;
      } else {
        credentialContent = "";
      }
      fs.writeFileSync(credentialPath, credentialContent, { encoding: "utf8" });
      console.log("Wrote credential to", credentialPath);
    }

    const jarPath = FM_MANAGER_JAR;
    if (!fs.existsSync(jarPath)) {
      return res.status(500).json({
        error: `fm-manager.jar not found at ${jarPath}. Set FM_MANAGER_JAR_PATH env var or place jar there.`,
      });
    }

    // Build args differently depending on OS
    const platform = process.platform;
    let args;

    if (platform === "win32") {
      // This was the fix for Windows: we wanna write the endpoint file and let JAR read it
      const fmDir = ensureFmDir();
      const endpointPath = path.join(fmDir, "endpoint");
      const endpointContent = `endpoint=https://fm-data.herokuapp.com/api/marketplaces/${marketplaceId}`;
      fs.writeFileSync(endpointPath, endpointContent, { encoding: "utf8" });
      console.log("Wrote endpoint to", endpointPath);

      args = [
        "-jar",
        jarPath,
        "--credential",
        credentialPath,
        "trades",
        `--sessions=${sessionId}`,
      ];
    } else {
      // for macOS/Linux we can pass endpoint directly
      const endpointArg = `https://fm-data.herokuapp.com/api/marketplaces/${marketplaceId}`;
      args = [
        "-jar",
        jarPath,
        "--credential",
        credentialPath,
        "--endpoint",
        endpointArg,
        "trades",
        `--sessions=${sessionId}`,
      ];
    }

    console.log("java", args.join(" "));
    const java = spawn("java", args);

    let stdout = "";
    let stderr = "";

    java.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    java.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    java.on("close", (code) => {
      if (code === 0) {
        const trimmedStdout = stdout.trim();
        if (!trimmedStdout) {
          const message = "This session did not have any application trades.";
          res.setHeader("Content-Type", "application/json");
          return res.status(200).json({ message, trades: [] });
        }
        res.setHeader("Content-Type", "text/csv");
        return res.status(200).send(stdout);
      }

      const errorDetails = stderr || stdout || "Unknown error";
      console.error(`fm-manager exited with code ${code}. stderr: ${errorDetails}`);

      let userMessage = "Unable to retrieve trades for this session.";
      if (
        errorDetails.includes("NullPointerException") ||
        errorDetails.includes("sessionOrders")
      ) {
        userMessage =
          "Session not found or has invalid data. Please verify the marketplace and session IDs.";
      } else if (
        errorDetails.includes("Authentication") ||
        errorDetails.includes("401") ||
        errorDetails.includes("Unauthorized")
      ) {
        userMessage = "Authentication failed. Please check your credentials.";
      } else if (
        errorDetails.includes("404") ||
        errorDetails.includes("Not Found")
      ) {
        userMessage =
          "Marketplace or session not found. Please select a valid marketplace and session.";
      }

      const errorResponse = {
        error: userMessage,
        details: errorDetails,
        exitCode: code,
      };
      res.setHeader("Content-Type", "application/json");
      return res.status(500).json(errorResponse);
    });
  } catch (err) {
    console.error("Error in /run-trades:", err);
    res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`fm-proxy listening on ${PORT}`));