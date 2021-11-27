#!/usr/bin/env node
import {
  convertUnixPathToWindows,
  removeFileExtension,
  getPackageMember,
  asyncForEach,
  getPackageFile,
  extractDependency,
  migrateDependency,
  EMPTY_PACKAGE_XML,
} from "./lib";

const fs = require("fs");
const fsPromises = fs.promises;
const execSync = require("child_process").execSync;

const IS_WINDOWS = process.platform === "win32";

const SANDBOX_ALIAS = "humana";
const NEW_PACKAGE_ID = "04t5e000000Jko0AAC";
const NAMESPACE = "dcorealpha";
const NEW_NAMESPACE = "dcorealpha";
const INSTALL_KEY = "";
const PACKAGE_NAME = "CoreConnectAlpha";
const DEFAULT_PERMSET_BACKUP_LOCATION = "./temp/permSetAssignments.csv";
const DEFAULT_TEMP_LOCATION = "./temp";

const createTempDirectory = async (targetPath = DEFAULT_TEMP_LOCATION) => {
  // make temp directory if not exist
  const path = convertUnixPathToWindows(targetPath);
  execSync(`mkdir ${IS_WINDOWS ? "" : " -p "} ${path}`, {
    stdio: "inherit",
  });
};

const backupPermissionSets = async (
  targetPath = DEFAULT_PERMSET_BACKUP_LOCATION
) => {
  console.log("Backing up permission set assignments");
  const path = convertUnixPathToWindows(targetPath);
  execSync(
    `sfdx force:data:soql:query -q "SELECT Id,AssigneeId,PermissionSetId FROM PermissionSetAssignment WHERE PermissionSet.NamespacePrefix = '${NAMESPACE}'" -r csv -u ${SANDBOX_ALIAS} > ${path}`,
    { stdio: "inherit" }
  );

  const hasPermSets =
    (
      await fsPromises.readFile(path, {
        encoding: "utf-8",
      })
    )?.trim().length > 0;
  if (hasPermSets) {
    // delete perm set assignments
    console.log("Deleting permission set assignments");
    execSync(
      `sfdx force:data:bulk:delete -u ${SANDBOX_ALIAS} -s PermissionSetAssignment -f ${path} -w 30`,
      { stdio: "inherit" }
    );
  }
  return hasPermSets;
};

const extractCustomMetadata = async () => {
  // retrieve list of custom metadata
  console.log("Identifying existing Core Connect metadata");
  execSync(
    `sfdx force:mdapi:listmetadata -m CustomMetadata -u ${SANDBOX_ALIAS} --json -f ${convertUnixPathToWindows(
      "./temp/customMetadata.json"
    )}`,
    { stdio: "inherit" }
  );
  // filter to just core connect metadata
  const exportedMetadata = require(convertUnixPathToWindows(
    "./temp/customMetadata.json"
  ));
  const dcoreMetadata = exportedMetadata.filter((row) => {
    return (
      row.fullName.startsWith(`${NAMESPACE}__`) &&
      row.namespacePrefix !== NAMESPACE
    );
  });
  // generate XML manifests
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/metadataPackage.xml"),
    getPackageFile(dcoreMetadata.map((row) => row.fullName))
  );
  // full list for retrieve

  // kvm
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./temp/kvm"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/kvm/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/kvm/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata
        .filter((item) =>
          item.fullName.startsWith(`${NAMESPACE}__Key_Value_Mapping`)
        )
        .map((row) => row.fullName)
    )
  );
  // actiom defs
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./temp/actions"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/actions/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/actions/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata
        .filter((item) =>
          item.fullName.startsWith(`${NAMESPACE}__Action_Definition`)
        )
        .map((row) => row.fullName)
    )
  );

  // config items
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./temp/items"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/items/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/items/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata
        .filter((item) =>
          item.fullName.startsWith(`${NAMESPACE}__Card_Configuration_Item`)
        )
        .map((row) => row.fullName)
    )
  );

  // Cards
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./temp/cards"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/cards/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/cards/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata
        .filter((item) =>
          item.fullName.startsWith(`${NAMESPACE}__Card_Configuration.`)
        )
        .map((row) => row.fullName)
    )
  );

  // data services
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./temp/services"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/services/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/services/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata
        .filter((item) =>
          item.fullName.startsWith(`${NAMESPACE}__Data_Service`)
        )
        .map((row) => row.fullName)
    )
  );

  // data sources
  execSync(
    `mkdir ${IS_WINDOWS ? "" : " -p "} ${convertUnixPathToWindows(
      "./temp/sources"
    )}`,
    {
      stdio: "inherit",
    }
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/sources/package.xml"),
    EMPTY_PACKAGE_XML
  );
  await fsPromises.writeFile(
    convertUnixPathToWindows("./temp/sources/destructiveChanges.xml"),
    getPackageFile(
      dcoreMetadata
        .filter((item) => item.fullName.startsWith(`${NAMESPACE}__Data_Source`))
        .map((row) => row.fullName)
    )
  );

  // retrieve metadata
  console.log("Backing up Core Connect metadata");
  execSync(
    `sfdx force:mdapi:retrieve -k ${convertUnixPathToWindows(
      "./temp/metadataPackage.xml"
    )} -u ${SANDBOX_ALIAS} -r ${convertUnixPathToWindows(
      "./temp/customMetadataBackup"
    )}`,
    { stdio: "inherit" }
  );

  execSync(
    `tar -xf ${convertUnixPathToWindows(
      "./temp/customMetadataBackup/unpackaged.zip"
    )} -C ${convertUnixPathToWindows("./temp/customMetadataBackup")}`,
    { stdio: "inherit" }
  );
  // copy to removal directory
  if (IS_WINDOWS) {
    // use robocopy command
    try {
      execSync(
        `robocopy ${convertUnixPathToWindows(
          "./temp/customMetadataBackup/unpackaged/"
        )} ${convertUnixPathToWindows("./temp/customMetadataExtraction")} /e`,
        { stdio: "inherit" }
      );
    } catch (error) {
      console.warn(error);
    }
  } else {
    // use cp command
    execSync(
      `cp -r ./temp/customMetadataBackup/unpackaged/ ./temp/customMetadataExtraction`,
      { stdio: "inherit" }
    );
  }
  if (NAMESPACE !== NEW_NAMESPACE) {
    // for migrate, convert namespace refs here
  }
  // delete cards in order
  console.log("Deleting Core Connect metadata");
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/kvm"
    )}`,
    {
      stdio: "inherit",
    }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/items"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/actions"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/cards"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/services"
    )}`,
    { stdio: "inherit" }
  );
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/sources"
    )}`,
    { stdio: "inherit" }
  );
};

const extractDependencies = async () => {
  console.log("Identifying dependencies");
  execSync(
    `sfdx force:data:soql:query -u ${SANDBOX_ALIAS} --usetoolingapi -q "SELECT MetadataComponentName,MetadataComponentType,RefMetadataComponentName,RefMetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentNamespace = '${NAMESPACE}'" --json > ${convertUnixPathToWindows(
      "./temp/dependencies.json"
    )}`,
    { stdio: "inherit" }
  );
  let dependenciesResult = require(convertUnixPathToWindows(
    "./temp/dependencies.json"
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
      convertUnixPathToWindows("./temp/dependentMetadata.xml"),
      dependentMetadataXml
    );
    console.log("Backing up dependencies");
    execSync(
      `sfdx force:mdapi:retrieve -u ${SANDBOX_ALIAS} -k ${convertUnixPathToWindows(
        "./temp/dependentMetadata.xml"
      )} -r ${convertUnixPathToWindows("./temp/dependentMetadataBackup")}`,
      { stdio: "inherit" }
    );
    execSync(
      `tar -xf ${convertUnixPathToWindows(
        "./temp/dependentMetadataBackup/unpackaged.zip"
      )} -C ${convertUnixPathToWindows("./temp/dependentMetadataBackup")}`,
      { stdio: "inherit" }
    );
    // copy to removal directory
    if (IS_WINDOWS) {
      // use robocopy command
      try {
        execSync(
          `robocopy ${convertUnixPathToWindows(
            "./temp/dependentMetadataBackup/unpackaged/"
          )} ${convertUnixPathToWindows(
            "./temp/dependentMetadataExtraction"
          )} /e`,
          { stdio: "inherit" }
        );
      } catch (error) {
        console.warn(error);
      }
    } else {
      // use cp command
      execSync(
        `cp -r ./temp/dependentMetadataBackup/unpackaged/ ./temp/dependentMetadataExtraction`,
        { stdio: "inherit" }
      );
    }
    // modify extraction metadata
    // iterate dependencies
    await asyncForEach(Object.keys(dependencies), async (type) => {
      switch (type) {
        case "ApexClass":
          await asyncForEach(dependencies[type], async (member) => {
            const filePath = `./temp/dependentMetadataExtraction/classes/${member}.cls`;
            const fileContent = fs.readFileSync(
              convertUnixPathToWindows(filePath),
              "utf8"
            );

            fs.writeFileSync(
              filePath,
              NAMESPACE === NEW_NAMESPACE
                ? await extractDependency(filePath, fileContent, type)
                : await migrateDependency(
                    filePath,
                    fileContent,
                    type,
                    NEW_NAMESPACE
                  )
            );
          });

          break;
        case "AuraDefinitionBundle":
          await asyncForEach(dependencies[type], async (member) => {
            const directory = `./temp/dependentMetadataExtraction/aura/${member}`;
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
              `./temp/dependentMetadataExtraction/flexipages/${member}.flexipage`
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
            const directory = `./temp/dependentMetadataExtraction/lwc/${member}`;
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
        "./temp/dependentMetadataExtraction"
      )}`,
      { stdio: "inherit" }
    );
  } else {
    console.log("No dependencies found");
  }
  return dependenciesResult?.length > 0;
};

const uninstallPackage = async () => {
  // retrieve installed packages as JSON
  execSync(
    `sfdx force:data:soql:query -u ${SANDBOX_ALIAS} --usetoolingapi --json -q "SELECT Id,SubscriberPackage.Name,SubscriberPackageId,SubscriberPackageVersion.Id FROM InstalledSubscriberPackage" > ${convertUnixPathToWindows(
      "./temp/installedPackages.json"
    )}`,
    { stdio: "inherit" }
  );
  // find and remove core connect
  const installedPackages = require(convertUnixPathToWindows(
    "./temp/installedPackages.json"
  )).result.records;
  const coreConnectPackageVersionId = installedPackages.find(
    (row) => row.SubscriberPackage.Name === PACKAGE_NAME
  ).SubscriberPackageVersion.Id;
  console.log("Uninstalling old Core Connect package version");
  execSync(
    `sfdx force:package:uninstall -u ${SANDBOX_ALIAS} -w 60 -p ${coreConnectPackageVersionId}`,
    { stdio: "inherit" }
  );
};

const installPackage = async () => {
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
};

const restorePermissionSets = async () => {
  // recreate perm set assignments
  console.log("Restoring permission set assignments");
  execSync(
    `sfdx force:data:bulk:upsert -u ${SANDBOX_ALIAS} -s PermissionSetAssignment -f ${convertUnixPathToWindows(
      "./temp/permSetAssignments.csv"
    )} -w 30 -i Id`,
    { stdio: "inherit" }
  );
};

const restoreCustomMetadata = async () => {
  // deploy backed up metadata
  console.log("Restoring Core Connect metadata");
  execSync(
    `sfdx force:mdapi:deploy -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/customMetadataExtraction"
    )} -w 30`,
    { stdio: "inherit" }
  );
};

const restoreDependencies = async () => {
  // deploy original dependencies
  console.log("Restoring dependencies");
  execSync(
    `sfdx force:mdapi:deploy -w 30 -u ${SANDBOX_ALIAS} -d ${convertUnixPathToWindows(
      "./temp/dependentMetadataBackup/unpackaged"
    )}`,
    { stdio: "inherit" }
  );
};

const cleanUpTempDirectory = async () => {
  // delete temp files
  if (IS_WINDOWS) {
    // delete directory on windows
    execSync(`rmdir /s /q ${convertUnixPathToWindows("./temp")}`, {
      stdio: "inherit",
    });
  } else {
    execSync(`rm -rf ${convertUnixPathToWindows("./temp")}`, {
      stdio: "inherit",
    });
  }
};

(async () => {
  // make temp directory if not exist
  await createTempDirectory();
  // retrieve perm permSetAssignments
  const hasPermSets = await backupPermissionSets();

  const hasDependencies = await extractDependencies();

  await extractCustomMetadata();

  await uninstallPackage();

  await installPackage();

  if (hasPermSets) {
    await restorePermissionSets();
  }

  await restoreCustomMetadata();

  if (hasDependencies) {
    await restoreDependencies();
  }

  await cleanUpTempDirectory();
  console.log("Done");
})();
