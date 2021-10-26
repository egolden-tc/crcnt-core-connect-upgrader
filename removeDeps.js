require("dotenv").config();
const sfdx = require("sfdx-node");
const SANDBOX_ALIAS = process.env.SANDBOX_ALIAS;
(async () => {
  // deploy empty dependencies
  await sfdx.force.mdapi.deploy({
    targetusername: SANDBOX_ALIAS,
    wait: 30,
    deploydir: "./manifests/emptyDeps",
    _quiet: false
  });
})();
