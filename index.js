#!/usr/bin/env node
const fs = require("fs");
const fsPromises = fs.promises;
const execSync = require("child_process").execSync;

// generate random string
const generateRandomString = (length) => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

const IS_WINDOWS = process.platform === "win32";
const TEMP_DIR = "temp" + generateRandomString(5);
const SANDBOX_ALIAS = "humana";
const NEW_PACKAGE_ID = "04t5e000000Jl4FAAS";
const NAMESPACE = "dcorealpha";
const INSTALL_KEY = "";
const PACKAGE_NAME = "CoreConnectAlpha";
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
const APEX_DEFAULT_CONTEXT_REGEX = new RegExp(
  `${NAMESPACE}\\.DefaultContextProvider\\.getDefaultContext\\([\\s\\S\\n\\r]*?\\);`
);
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
const removeFileExtension = (fileName) => {
  const extension = fileName.split(".").pop();
  return fileName.replace(`.${extension}`, "");
};

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

const extractDependency = async (fileName, fileContent, metadataType) => {
  let newFileContent = fileContent;
  switch (metadataType) {
    case "ApexClass":
      newFileContent = newFileContent.replace(CONTEXT_PROVIDER_REGEX, "");
      newFileContent = newFileContent.replace(DATA_SOURCE_PROVIDER_REGEX, "");
      newFileContent = newFileContent.replace(APEX_DATA_PROVIDER_REGEX, "");
      newFileContent = newFileContent.replace(OVERRIDE_REGEX, " ");
      newFileContent = newFileContent.replace(
        APEX_DEFAULT_CONTEXT_REGEX,
        "new Map<String,Object>();"
      );
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

const convertUnixPathToWindows = (path) => {
  if (IS_WINDOWS) {
    return path.replace(/\//g, "\\");
  }
  return path;
};

const getPackageMember = (memberName) => {
  return `<members>${memberName}</members>
  `;
};

const getPackageFile = (listOfMembers) => {
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
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./" + TEMP_DIR
    )}`,
    {
      stdio: "inherit",
    }
  );
  // retrieve perm permSetAssignments
  console.log("Backing up permission set assignments");
  execSync(
    `sfdx force:data:soql:query -q "SELECT Id,AssigneeId,PermissionSetId FROM PermissionSetAssignment WHERE PermissionSet.NamespacePrefix = '${NAMESPACE}'" -r csv -u ${SANDBOX_ALIAS} > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/permSetAssignments.csv"
    )}`,
    { stdio: "inherit" }
  );

  const hasPermSets =
    (
      await fsPromises.readFile(
        convertUnixPathToWindows(`./${TEMP_DIR}/permSetAssignments.csv`),
        {
          encoding: "utf-8",
        }
      )
    )?.trim().length > 0;
  if (hasPermSets) {
    // delete perm set assignments
    console.log("Deleting permission set assignments");
    execSync(
      `sfdx force:data:bulk:delete -u ${SANDBOX_ALIAS} -s PermissionSetAssignment -f ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/permSetAssignments.csv"
      )} -w 30`,
      { stdio: "inherit" }
    );
  }
  console.log("Identifying dependencies");
  execSync(
    `sfdx force:data:soql:query -u ${SANDBOX_ALIAS} --usetoolingapi -q "SELECT MetadataComponentName,MetadataComponentType,RefMetadataComponentName,RefMetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentNamespace = '${NAMESPACE}'" --json > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/dependencies.json"
    )}`,
    { stdio: "inherit" }
  );
  let dependenciesResult = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/dependencies.json"
  )).result?.records;
  const SUPPORTED_TYPES = [
    "AuraDefinitionBundle",
    "FlexiPage",
    "LightningComponentBundle",
    "ApexClass",
  ];
  dependenciesResult = dependenciesResult.filter((dep) =>
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
    Object.keys(dependencies).forEach((type) => {
      dependentMetadataXml += `<types>
        <name>${type}</name>
        ${dependencies[type]
          .map((member) => {
            return getPackageMember(member);
          })
          .join("")}
      </types>`;
    });
    dependentMetadataXml += PACKAGE_XML_FINAL;

    await fsPromises.writeFile(
      convertUnixPathToWindows("./" + TEMP_DIR + "/dependentMetadata.xml"),
      dependentMetadataXml
    );
    console.log("Backing up dependencies");
    execSync(
      `sfdx force:mdapi:retrieve -u ${SANDBOX_ALIAS} -k ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/dependentMetadata.xml"
      )} -r ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/dependentMetadataBackup"
      )}`,
      { stdio: "inherit" }
    );
    execSync(
      `tar -xf ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/dependentMetadataBackup/unpackaged.zip"
      )} -C ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/dependentMetadataBackup"
      )}`,
      { stdio: "inherit" }
    );
    // copy to removal directory
    if (IS_WINDOWS) {
      // use robocopy command
      try {
        execSync(
          `robocopy ${convertUnixPathToWindows(
            "./" + TEMP_DIR + "/dependentMetadataBackup/unpackaged/"
          )} ${convertUnixPathToWindows(
            "./" + TEMP_DIR + "/dependentMetadataExtraction"
          )} /e`,
          { stdio: "inherit" }
        );
      } catch (error) {
        console.warn(error);
      }
    } else {
      // use cp command
      execSync(
        `cp -r ./${TEMP_DIR}/dependentMetadataBackup/unpackaged/ ./${TEMP_DIR}/dependentMetadataExtraction`,
        { stdio: "inherit" }
      );
    }
    // modify extraction metadata
    // iterate dependencies
    await asyncForEach(Object.keys(dependencies), async (type) => {
      switch (type) {
        case "ApexClass":
          await asyncForEach(dependencies[type], async (member) => {
            const filePath = `./${TEMP_DIR}/dependentMetadataExtraction/classes/${member}.cls`;
            const fileContent = fs.readFileSync(
              convertUnixPathToWindows(filePath),
              "utf8"
            );
            fs.writeFileSync(
              filePath,
              await extractDependency(filePath, fileContent, type)
            );
          });

          break;
        case "AuraDefinitionBundle":
          await asyncForEach(dependencies[type], async (member) => {
            const directory = `./${TEMP_DIR}/dependentMetadataExtraction/aura/${member}`;
            if (fs.existsSync(convertUnixPathToWindows(directory))) {
              // iterate files in directory and sort into html and js files
              const files = fs.readdirSync(directory);
              await asyncForEach(
                files.filter(
                  (fileName) =>
                    fileName.endsWith(".app") || fileName.endsWith(".cmp")
                ),
                async (file) => {
                  const filePath = convertUnixPathToWindows(
                    `${directory}/${file}`
                  );

                  const fileContent = fs.readFileSync(filePath, "utf8");
                  fs.writeFileSync(
                    filePath,
                    await extractDependency(filePath, fileContent, type)
                  );
                }
              );
            }
          });
          break;
        case "FlexiPage":
          await asyncForEach(dependencies[type], async (member) => {
            const filePath = convertUnixPathToWindows(
              `./${TEMP_DIR}/dependentMetadataExtraction/flexipages/${member}.flexipage`
            );
            const fileContent = fs.readFileSync(
              convertUnixPathToWindows(filePath),
              "utf8"
            );
            const dep = await extractDependency(filePath, fileContent, type);
            fs.writeFileSync(filePath, dep);
          });
          break;
        case "LightningComponentBundle":
          await asyncForEach(dependencies[type], async (member) => {
            const directory = `./${TEMP_DIR}/dependentMetadataExtraction/lwc/${member}`;
            if (fs.existsSync(convertUnixPathToWindows(directory))) {
              // iterate files in directory and sort into html and js files
              const files = fs.readdirSync(convertUnixPathToWindows(directory));
              await asyncForEach(
                files.filter(
                  (fileName) =>
                    fileName.endsWith(".js") || fileName.endsWith(".html")
                ),
                async (file) => {
                  const filePath = convertUnixPathToWindows(
                    `${directory}/${file}`
                  );
                  const fileContent = fs.readFileSync(filePath, "utf8");
                  fs.writeFileSync(
                    filePath,
                    await extractDependency(filePath, fileContent, type)
                  );
                }
              );
            }
          });
          break;
      }
    });
    console.log("Extracting dependencies");
    execSync(
      `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/dependentMetadataExtraction"
      )}`,
      { stdio: "inherit" }
    );
  } else {
    console.log("No dependencies found");
  }

  // retrieve list of custom metadata
  console.log("Identifying existing Core Connect metadata");
  execSync(
    `sfdx force:data:soql:query -q "SELECT DeveloperName,NamespacePrefix FROM ${NAMESPACE}__Card_Configuration__mdt" -u ${SANDBOX_ALIAS} --json > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/cards.json"
    )}`
  );
  execSync(
    `sfdx force:data:soql:query -q "SELECT DeveloperName,NamespacePrefix FROM ${NAMESPACE}__Card_Configuration_Item__mdt" -u ${SANDBOX_ALIAS} --json > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/items.json"
    )}`
  );
  execSync(
    `sfdx force:data:soql:query -q "SELECT DeveloperName,NamespacePrefix FROM ${NAMESPACE}__Action_Definition__mdt" -u ${SANDBOX_ALIAS} --json > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/actions.json"
    )}`
  );
  execSync(
    `sfdx force:data:soql:query -q "SELECT DeveloperName,NamespacePrefix FROM ${NAMESPACE}__Key_Value_Mapping__mdt" -u ${SANDBOX_ALIAS} --json > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/kvms.json"
    )}`
  );
  execSync(
    `sfdx force:data:soql:query -q "SELECT DeveloperName,NamespacePrefix FROM ${NAMESPACE}__Data_Service__mdt" -u ${SANDBOX_ALIAS} --json > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/services.json"
    )}`
  );
  execSync(
    `sfdx force:data:soql:query -q "SELECT DeveloperName,NamespacePrefix FROM ${NAMESPACE}__Data_Source__mdt" -u ${SANDBOX_ALIAS} --json > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/sources.json"
    )}`
  );

  const exportedCards = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/cards.json"
  ))
    .result.records.filter((record) => record.NamespacePrefix !== NAMESPACE)
    .map((card) => `${NAMESPACE}__Card_Configuration.${card.DeveloperName}`);
  const exportedItems = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/items.json"
  ))
    .result.records.filter((record) => record.NamespacePrefix !== NAMESPACE)
    .map(
      (item) => `${NAMESPACE}__Card_Configuration_Item.${item.DeveloperName}`
    );
  const exportedActions = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/actions.json"
  ))
    .result.records.filter((record) => record.NamespacePrefix !== NAMESPACE)
    .map((action) => `${NAMESPACE}__Action_Definition.${action.DeveloperName}`);
  const exportedKvms = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/kvms.json"
  ))
    .result.records.filter((record) => record.NamespacePrefix !== NAMESPACE)
    .map((kvm) => `${NAMESPACE}__Key_Value_Mapping.${kvm.DeveloperName}`);
  const exportedServices = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/services.json"
  ))
    .result.records.filter((record) => record.NamespacePrefix !== NAMESPACE)
    .map((service) => `${NAMESPACE}__Data_Service.${service.DeveloperName}`);
  const exportedSources = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/sources.json"
  ))
    .result.records.filter((record) => record.NamespacePrefix !== NAMESPACE)
    .map((source) => `${NAMESPACE}__Data_Source.${source.DeveloperName}`);

  const dcoreMetadata = exportedCards.concat(
    exportedItems,
    exportedActions,
    exportedKvms,
    exportedServices,
    exportedSources
  );

  // generate XML manifests
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/metadataPackage.xml"),
    getPackageFile(dcoreMetadata)
  );
  // full list for retrieve

  // kvm
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/kvm"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/kvm/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/kvm/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata.filter((item) =>
        item.startsWith(`${NAMESPACE}__Key_Value_Mapping`)
      )
    )
  );
  // actiom defs
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/actions"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/actions/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows(
      "./" + TEMP_DIR + "/actions/destructiveChanges.xml"
    ),
    getPackageFile(
      dcoreMetadata.filter((item) =>
        item.startsWith(`${NAMESPACE}__Action_Definition`)
      )
    )
  );

  // config items
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/items"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/items/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/items/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata.filter((item) =>
        item.startsWith(`${NAMESPACE}__Card_Configuration_Item`)
      )
    )
  );

  // Cards
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/cards"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/cards/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/cards/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata.filter((item) =>
        item.startsWith(`${NAMESPACE}__Card_Configuration.`)
      )
    )
  );

  // data services
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/services"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/services/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows(
      "./" + TEMP_DIR + "/services/destructiveChanges.xml"
    ),
    getPackageFile(
      dcoreMetadata.filter((item) =>
        item.startsWith(`${NAMESPACE}__Data_Service`)
      )
    )
  );

  // data sources
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/sources"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./" + TEMP_DIR + "/sources/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows(
      "./" + TEMP_DIR + "/sources/destructiveChanges.xml"
    ),
    getPackageFile(
      dcoreMetadata.filter((item) =>
        item.startsWith(`${NAMESPACE}__Data_Source`)
      )
    )
  );

  // retrieve metadata
  console.log("Backing up Core Connect metadata");
  execSync(
    `sfdx force:mdapi:retrieve -k ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/metadataPackage.xml"
    )} -u ${SANDBOX_ALIAS} -r ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/customMetadataBackup"
    )}`,
    { stdio: "inherit" }
  );
  // delete cards in order
  console.log("Deleting Core Connect metadata");
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/kvm"
    )}`,
    {
      stdio: "inherit",
    }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/items"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/actions"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/cards"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/services"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/sources"
    )}`,
    { stdio: "inherit" }
  );

  // retrieve installed packages as JSON
  execSync(
    `sfdx force:data:soql:query -u ${SANDBOX_ALIAS} --usetoolingapi --json -q "SELECT Id,SubscriberPackage.Name,SubscriberPackageId,SubscriberPackageVersion.Id FROM InstalledSubscriberPackage" > ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/installedPackages.json"
    )}`,
    { stdio: "inherit" }
  );
  // find and remove core connect
  const installedPackages = require(convertUnixPathToWindows(
    "./" + TEMP_DIR + "/installedPackages.json"
  )).result.records;
  const coreConnectPackageVersionId = installedPackages.find(
    (row) => row.SubscriberPackage.Name === PACKAGE_NAME
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
      `sfdx force:data:bulk:upsert -u ${SANDBOX_ALIAS} -s PermissionSetAssignment -f ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/permSetAssignments.csv"
      )} -w 30 -i Id`,
      { stdio: "inherit" }
    );
  }

  // deploy backed up metadata
  console.log("Restoring Core Connect metadata");
  execSync(
    `sfdx force:mdapi:deploy -u ${SANDBOX_ALIAS} -f ${convertUnixPathToWindows(
      "./" + TEMP_DIR + "/customMetadataBackup/unpackaged.zip"
    )} -w 30`,
    { stdio: "inherit" }
  );
  // deploy original dependencies
  if (dependenciesResult) {
    console.log("Restoring dependencies");
    execSync(
      `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
        "./" + TEMP_DIR + "/dependentMetadataBackup/unpackaged"
      )}`,
      { stdio: "inherit" }
    );
  }

  // delete temp files
  if (IS_WINDOWS) {
    // delete directory on windows
    execSync(`rmdir /s /q ${convertUnixPathToWindows("./" + TEMP_DIR)}`, {
      stdio: "inherit",
    });
  } else {
    execSync(`rm -rf ${convertUnixPathToWindows("./" + TEMP_DIR)}`, {
      stdio: "inherit",
    });
  }
  console.log("Done");
})();
