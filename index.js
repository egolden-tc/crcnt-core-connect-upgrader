#!/usr/bin/env node
require("dotenv").config();
const fs = require("fs");
const fsPromises = fs.promises;
const execSync = require("child_process").execSync;
const IS_WINDOWS = process.platform === "win32";
const SANDBOX_ALIAS = process.env.SANDBOX_ALIAS;
const NEW_PACKAGE_ID = process.env.LATEST_PACKAGE_ID;
const NAMESPACE = process.env.NAMESPACE;
const INSTALL_KEY = process.env.INSTALL_KEY;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const EMPTY_PACKAGE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <version>53.0</version>
</Package>`;
const PACKAGE_XML_BASE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">`;
const PACKAGE_XML_FINAL = `<version>53.0</version>
</Package>`;
const PACKAGE_XML_START = `${PACKAGE_XML_BASE}
  <types>
    <name>CustomMetadata</name>`;

const PACKAGE_XML_END = `  </types>
${PACKAGE_XML_FINAL}`;

const MULTICARD_COMPONENT_REGEX = new RegExp(
  `<itemInstances>[\\s\\S]*?<componentName>${NAMESPACE}:ConnectMultiCard<\/componentName>[\\s\\S]*?<\/itemInstances>`,
  "g"
);
const SINGLECARD_COMPONENT_REGEX = new RegExp(
  `<itemInstances>[\\s\\S]*?<componentName>${NAMESPACE}:ConnectSingleCard<\/componentName>[\\s\\S]*?<\/itemInstances>`,
  "g"
);
const CONTEXT_PROVIDER_REGEX = `implements ${NAMESPACE}.ContextProvider`;
const DATA_SOURCE_PROVIDER_REGEX = `extends ${NAMESPACE}.DataSourceProvider`;
const APEX_DATA_PROVIDER_REGEX = `extends ${NAMESPACE}.ApexDataProvider`;
const AURA_MULTICARD_REGEX = new RegExp(
  `<${NAMESPACE}:ConnectMultiCard[\\s\\S].*[\\/|<\\/${NAMESPACE}:ConnectMultiCard>]>`,
  "g"
);
const AURA_SINGLECARD_REGEX = new RegExp(
  `<${NAMESPACE}:ConnectSingleCard[\\s\\S].*[\\/|<\\/${NAMESPACE}:ConnectSingleCard>]>`,
  "g"
);
const LWC_FLEXICARD_REGEX = new RegExp(
  `<${NAMESPACE}-flexi-card[\\s\\S]*?<\\/${NAMESPACE}-flexi-card>`,
  "g"
);
const LWC_CARD_EXTENSION_IMPORT_REGEX = new RegExp(
  `import FlexiCard from "${NAMESPACE}\\/flexiCard";`,
  "g"
);
const LWC_CARD_EXTENSION_EXTENDS_REGEX = `extends FlexiCard`;
const OVERRIDE_REGEX = ` override `;
const removeFileExtension = fileName => {
  const extension = fileName.split(".").pop();
  return fileName.replace(`.${extension}`, "");
};

const extractDependency = (fileName, fileContent, metadataType) => {
  let newFileContent = fileContent;
  switch (metadataType) {
    case "ApexClass":
      newFileContent = newFileContent.replace(CONTEXT_PROVIDER_REGEX, "");
      newFileContent = newFileContent.replace(DATA_SOURCE_PROVIDER_REGEX, "");
      newFileContent = newFileContent.replace(APEX_DATA_PROVIDER_REGEX, "");
      newFileContent = newFileContent.replace(OVERRIDE_REGEX, " ");
      break;
    case "AuraDefinitionBundle":
      newFileContent = newFileContent.replace(AURA_MULTICARD_REGEX, "");
      newFileContent = newFileContent.replace(AURA_SINGLECARD_REGEX, "");
      break;
    case "LightningComponentBundle":
      if (fileName.endsWith(".html")) {
        newFileContent = newFileContent.replace(LWC_FLEXICARD_REGEX, "");
      } else if (fileName.endsWith(".js")) {
        newFileContent = newFileContent.replace(
          LWC_CARD_EXTENSION_IMPORT_REGEX,
          ""
        );
        newFileContent = newFileContent.replace(
          LWC_CARD_EXTENSION_EXTENDS_REGEX,
          ""
        );
      }
      break;
    case "FlexiPage":
      newFileContent = newFileContent.replace(MULTICARD_COMPONENT_REGEX, "");
      newFileContent = newFileContent.replace(SINGLECARD_COMPONENT_REGEX, "");
      break;
    default:
      break;
  }
  return newFileContent;
};

const getPackageMember = memberName => {
  return `<members>${memberName}</members>
  `;
};

const getPackageFile = listOfMembers => {
  return (
    PACKAGE_XML_START +
    listOfMembers.reduce((acc, member) => {
      return acc + getPackageMember(member);
    }, "") +
    PACKAGE_XML_END
  );
};
(async () => {
  // make temp directory if not exist
  execSync("mkdir -p ./temp", { stdio: "inherit" });
  // retrieve perm permSetAssignments
  console.log("Backing up permission set assignments");
  execSync(
    `sfdx force:data:soql:query -q "SELECT Id,AssigneeId,PermissionSetId FROM PermissionSetAssignment WHERE PermissionSet.NamespacePrefix = '${NAMESPACE}'" -r csv -u ${SANDBOX_ALIAS} > ./temp/permSetAssignments.csv`,
    { stdio: "inherit" }
  );

  const hasPermSets =
    (
      await fsPromises.readFile("./temp/permSetAssignments.csv", {
        encoding: "utf-8"
      })
    )?.trim().length > 0;
  if (hasPermSets) {
    // delete perm set assignments
    console.log("Deleting permission set assignments");
    execSync(
      `sfdx force:data:bulk:delete -u ${SANDBOX_ALIAS} -s PermissionSetAssignment -f ./temp/permSetAssignments.csv -w 30`,
      { stdio: "inherit" }
    );
  }
  console.log("Identifying dependencies");
  execSync(
    `sfdx force:data:soql:query -u ${SANDBOX_ALIAS} --usetoolingapi -q "SELECT MetadataComponentName,MetadataComponentType,RefMetadataComponentName,RefMetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentNamespace = '${NAMESPACE}'" --json > ./temp/dependencies.json`,
    { stdio: "inherit" }
  );
  let dependenciesResult = require("./temp/dependencies.json").result?.records;
  const SUPPORTED_TYPES = [
    "AuraDefinitionBundle",
    "FlexiPage",
    "LightningComponentBundle",
    "ApexClass"
  ];
  dependenciesResult = dependenciesResult.filter(dep =>
    SUPPORTED_TYPES.includes(dep.MetadataComponentType)
  );
  if (dependenciesResult) {
    // create xml file with all types
    // get set of types
    console.log("Dependencies found");
    const dependencies = dependenciesResult.reduce((acc, dependency) => {
      if (!acc[dependency.MetadataComponentType]) {
        acc[dependency.MetadataComponentType] = [];
      }
      const cleanName = removeFileExtension(dependency.MetadataComponentName);
      if (acc[dependency.MetadataComponentType].indexOf(cleanName) === -1) {
        acc[dependency.MetadataComponentType].push(cleanName);
      }
      return acc;
    }, {});
    let dependentMetadataXml = PACKAGE_XML_BASE;
    Object.keys(dependencies).forEach(type => {
      dependentMetadataXml += `<types>
        <name>${type}</name>
        ${dependencies[type]
          .map(member => {
            return getPackageMember(member);
          })
          .join("")}
      </types>`;
    });
    dependentMetadataXml += PACKAGE_XML_FINAL;

    await fsPromises.writeFile(
      "./temp/dependentMetadata.xml",
      dependentMetadataXml
    );
    console.log("Backing up dependencies");
    execSync(
      `sfdx force:mdapi:retrieve -u ${SANDBOX_ALIAS} -k ./temp/dependentMetadata.xml -r ./temp/dependentMetadataBackup`,
      { stdio: "inherit" }
    );
    execSync(
      `tar -xf ./temp/dependentMetadataBackup/unpackaged.zip -C ./temp/dependentMetadataBackup`,
      { stdio: "inherit" }
    );
    // copy to removal directory
    if (IS_WINDOWS) {
      // use robocopy command
      execSync(
        `robocopy ./temp/dependentMetadataBackup/unpackaged/ ./temp/dependentMetadataExtraction /e`,
        { stdio: "inherit" }
      );
    } else {
      // use cp command
      execSync(
        `cp -r ./temp/dependentMetadataBackup/unpackaged/ ./temp/dependentMetadataExtraction`,
        { stdio: "inherit" }
      );
    }
    // modify extraction metadata
    // iterate dependencies
    Object.keys(dependencies).forEach(type => {
      switch (type) {
        case "ApexClass":
          dependencies[type].forEach(member => {
            const filePath = `./temp/dependentMetadataExtraction/classes/${member}.cls`;
            const fileContent = fs.readFileSync(filePath, "utf8");
            fs.writeFileSync(
              filePath,
              extractDependency(filePath, fileContent, type)
            );
          });
          break;
        case "AuraDefinitionBundle":
          dependencies[type].forEach(member => {
            const directory = `./temp/dependentMetadataExtraction/aura/${member}`;
            if (fs.existsSync(directory)) {
              // iterate files in directory and sort into html and js files
              const files = fs.readdirSync(directory);
              files
                .filter(
                  fileName =>
                    fileName.endsWith(".app") || fileName.endsWith(".cmp")
                )
                .forEach(file => {
                  const filePath = `${directory}/${file}`;

                  const fileContent = fs.readFileSync(filePath, "utf8");
                  fs.writeFileSync(
                    filePath,
                    extractDependency(filePath, fileContent, type)
                  );
                });
            }
          });
          break;
        case "FlexiPage":
          dependencies[type].forEach(member => {
            const filePath = `./temp/dependentMetadataExtraction/flexipages/${member}.flexipage`;
            const fileContent = fs.readFileSync(filePath, "utf8");
            fs.writeFileSync(
              filePath,
              extractDependency(filePath, fileContent, type)
            );
          });
          break;
        case "LightningComponentBundle":
          dependencies[type].forEach(member => {
            const directory = `./temp/dependentMetadataExtraction/lwc/${member}`;
            if (fs.existsSync(directory)) {
              // iterate files in directory and sort into html and js files
              const files = fs.readdirSync(directory);
              files
                .filter(
                  fileName =>
                    fileName.endsWith(".js") || fileName.endsWith(".html")
                )
                .forEach(file => {
                  const filePath = `${directory}/${file}`;
                  const fileContent = fs.readFileSync(filePath, "utf8");
                  fs.writeFileSync(
                    filePath,
                    extractDependency(filePath, fileContent, type)
                  );
                });
            }
          });
          break;
      }
    });
    console.log("Extracting dependencies");
    execSync(
      `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/dependentMetadataExtraction`,
      { stdio: "inherit" }
    );
  } else {
    console.log("No dependencies found");
  }

  // retrieve list of custom metadata
  console.log("Identifying existing Core Connect metadata");
  execSync(
    `sfdx force:mdapi:listmetadata -m CustomMetadata -u ${SANDBOX_ALIAS} --json -f ./temp/customMetadata.json`,
    { stdio: "inherit" }
  );
  // filter to just core connect metadata
  const exportedMetadata = require("./temp/customMetadata.json");
  const dcoreMetadata = exportedMetadata.filter(row => {
    return (
      row.fullName.startsWith(`${NAMESPACE}__`) &&
      row.namespacePrefix !== NAMESPACE
    );
  });
  // generate XML manifests
  await fsPromises.writeFile(
    "./temp/metadataPackage.xml",
    getPackageFile(dcoreMetadata.map(row => row.fullName))
  );
  // full list for retrieve

  // kvm
  execSync("mkdir -p ./temp/kvm");
  await fsPromises.writeFile("./temp/kvm/package.xml", EMPTY_PACKAGE_XML);
  await fsPromises.writeFile(
    "./temp/kvm/destructiveChanges.xml",
    getPackageFile(
      dcoreMetadata
        .filter(item =>
          item.fullName.startsWith(`${NAMESPACE}__Key_Value_Mapping`)
        )
        .map(row => row.fullName)
    )
  );
  // actiom defs
  execSync("mkdir -p ./temp/actions");
  await fsPromises.writeFile("./temp/actions/package.xml", EMPTY_PACKAGE_XML);
  await fsPromises.writeFile(
    "./temp/actions/destructiveChanges.xml",
    getPackageFile(
      dcoreMetadata
        .filter(item =>
          item.fullName.startsWith(`${NAMESPACE}__Action_Definition`)
        )
        .map(row => row.fullName)
    )
  );

  // config items
  execSync("mkdir -p ./temp/items");
  await fsPromises.writeFile("./temp/items/package.xml", EMPTY_PACKAGE_XML);
  await fsPromises.writeFile(
    "./temp/items/destructiveChanges.xml",
    getPackageFile(
      dcoreMetadata
        .filter(item =>
          item.fullName.startsWith(`${NAMESPACE}__Card_Configuration_Item`)
        )
        .map(row => row.fullName)
    )
  );

  // Cards
  execSync("mkdir -p ./temp/cards");
  await fsPromises.writeFile("./temp/cards/package.xml", EMPTY_PACKAGE_XML);
  await fsPromises.writeFile(
    "./temp/cards/destructiveChanges.xml",
    getPackageFile(
      dcoreMetadata
        .filter(item =>
          item.fullName.startsWith(`${NAMESPACE}__Card_Configuration.`)
        )
        .map(row => row.fullName)
    )
  );

  // data services
  execSync("mkdir -p ./temp/services");
  await fsPromises.writeFile("./temp/services/package.xml", EMPTY_PACKAGE_XML);
  await fsPromises.writeFile(
    "./temp/services/destructiveChanges.xml",
    getPackageFile(
      dcoreMetadata
        .filter(item => item.fullName.startsWith(`${NAMESPACE}__Data_Service`))
        .map(row => row.fullName)
    )
  );

  // data sources
  execSync("mkdir -p ./temp/sources");
  await fsPromises.writeFile("./temp/sources/package.xml", EMPTY_PACKAGE_XML);
  await fsPromises.writeFile(
    "./temp/sources/destructiveChanges.xml",
    getPackageFile(
      dcoreMetadata
        .filter(item => item.fullName.startsWith(`${NAMESPACE}__Data_Source`))
        .map(row => row.fullName)
    )
  );

  // retrieve metadata
  console.log("Backing up Core Connect metadata");
  execSync(
    `sfdx force:mdapi:retrieve -k ./temp/metadataPackage.xml -u ${SANDBOX_ALIAS} -r ./temp/customMetadataBackup`,
    { stdio: "inherit" }
  );
  // delete cards in order
  console.log("Deleting Core Connect metadata");
  execSync(`sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/kvm`, {
    stdio: "inherit"
  });
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/items`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/actions`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/cards`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/services`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/sources`,
    { stdio: "inherit" }
  );

  // retrieve installed packages as JSON
  execSync(
    `sfdx force:data:soql:query -u ${SANDBOX_ALIAS} --usetoolingapi --json -q "SELECT Id,SubscriberPackage.Name,SubscriberPackageId,SubscriberPackageVersion.Id FROM InstalledSubscriberPackage" > ./temp/installedPackages.json`,
    { stdio: "inherit" }
  );
  // find and remove core connect
  const installedPackages = require("./temp/installedPackages.json").result
    .records;
  const coreConnectPackageVersionId = installedPackages.find(
    row => row.SubscriberPackage.Name === PACKAGE_NAME
  ).SubscriberPackageVersion.Id;
  console.log("Uninstalling old Core Connect package version");
  execSync(
    `sfdx force:package:uninstall -u ${SANDBOX_ALIAS} -w 60 -p ${coreConnectPackageVersionId}`,
    { stdio: "inherit" }
  );
  // install new package via package version Id
  console.log("Installing new Core Connect package version");
  if (INSTALL_KEY) {
    execSync(
      `sfdx force:package:install -u ${SANDBOX_ALIAS} -w 60 -p ${NEW_PACKAGE_ID} -r -k ${INSTALL_KEY}`,
      { stdio: "inherit" }
    );
  } else {
    execSync(
      `sfdx force:package:install -u ${SANDBOX_ALIAS} -w 60 -p ${NEW_PACKAGE_ID} -r`,
      { stdio: "inherit" }
    );
  }
  // recreate perm set assignments
  if (hasPermSets) {
    console.log("Restoring permission set assignments");
    execSync(
      `sfdx force:data:bulk:upsert -u ${SANDBOX_ALIAS} -s PermissionSetAssignment -f ./temp/permSetAssignments.csv -w 30 -i Id`,
      { stdio: "inherit" }
    );
  }

  // deploy backed up metadata
  console.log("Restoring Core Connect metadata");
  execSync(
    `sfdx force:mdapi:deploy -u ${SANDBOX_ALIAS} -f ./temp/customMetadataBackup/unpackaged.zip -w 30`,
    { stdio: "inherit" }
  );
  // deploy original dependencies
  if (dependenciesResult) {
    console.log("Restoring dependencies");
    execSync(
      `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ./temp/dependentMetadataBackup/unpackaged`,
      { stdio: "inherit" }
    );
  }

  // delete temp files
  execSync(`rm -rf ./temp`, { stdio: "inherit" });
  console.log("Done");
})();
