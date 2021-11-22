# Core Connect Package Upgrader for Sandboxes

This application is used for upgrading customer sandboxes to the latest Core Connect package version without the need for a clean upgrade path and without manual steps.

## Instructions

1. Start by cloning this repo locally and navigating into that folder
   ```
    git clone https://github.com/egolden-tc/crcnt-core-connect-upgrader.git
    cd crcnt-core-connect-upgrader
   ```
2. For a traditional environment, authorize the sandbox:
   ```
    sfdx force:auth:web:login -a humana -r https://test.salesforce.com
   ```
   _NOTE_ - on a Humana VDI org, use the following command instead:
   ```
   sfdx force:auth:device:login -a humana -r https://test.salesforce.com
   ```
   Follow the instructions in the prompt to complete org authentication.
3. After the org is authorized, you can run the following command to execute the script
   ```
   npm run upgrade
   ```

## Package Id Update Instructions

Each time a new package is built, this repo needs to be updated with the latest package version id. This can be done by copying the new package id from the Alpha package url in the Core Connect repo README and replacing the old id on line 9 of the index.js file in this repo. Then commit and push the change. When the `npm run upgrade` command is run, it pulls down the latest changes including any package id updates.
