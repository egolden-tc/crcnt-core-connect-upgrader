# Core Connect Package Upgrader for Sandboxes

This application is used for upgrading customer sandboxes to the latest Core Connect package version without the need for a clean upgrade path and without manual steps.

## Instructions

1. Authorize the Core Connect DevHub using the following command:
   ```
    sfdx force:auth:web:login -a devhub
   ```
2. Once that's authorized, run the following command to authorize the target customer sandbox
   ```
   sfdx force:auth:web:login -r https://test.salesforce.com -a sandbox
   ```
3. After both orgs are authorized, you can run the following command to execute the script
   ```
   node index.js
   ```
