#!/usr/bin/env node
const fs = require("fs");
const execSync = require("child_process").execSync;
const IS_WINDOWS = process.platform === "win32";

const SANDBOX_ALIAS = "humana";

const convertUnixPathToWindows = (path) => {
  if (IS_WINDOWS) {
    return path.replace(/\//g, "\\");
  }
  return path;
};

(async () => {
  // recreate perm set assignments
  if (
    fs.existsSync(convertUnixPathToWindows("./temp/permSetAssignments.csv"))
  ) {
    console.log("Restoring permission set assignments");
    execSync(
      `sfdx force:data:bulk:upsert -u ${SANDBOX_ALIAS} -s PermissionSetAssignment -f ${convertUnixPathToWindows(
        "./temp/permSetAssignments.csv"
      )} -w 30 -i Id`,
      { stdio: "inherit" }
    );
  }

  // deploy backed up metadata
  if (fs.existsSync(convertUnixPathToWindows("./temp/metadata.zip"))) {
    console.log("Restoring Core Connect metadata");
    execSync(
      `sfdx force:mdapi:deploy -u ${SANDBOX_ALIAS} -f ${convertUnixPathToWindows(
        "./temp/customMetadataBackup/unpackaged.zip"
      )} -w 30`,
      { stdio: "inherit" }
    );
  }
  // deploy original dependencies
  if (
    fs.existsSync(
      convertUnixPathToWindows("./temp/dependendMetadataBackup/unpackaged")
    )
  ) {
    console.log("Restoring dependencies");
    execSync(
      `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
        "./temp/dependentMetadataBackup/unpackaged"
      )}`,
      { stdio: "inherit" }
    );
  }
})();
