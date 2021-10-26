require("dotenv").config();
const sfdx = require("sfdx-node");
const fs = require("fs");
const fsPromises = fs.promises;
const xml2js = require("xml2js");

const SANDBOX_ALIAS = process.env.SANDBOX_ALIAS;
const DEVHUB_ALIAS = process.env.DEVHUB_ALIAS;
const NAMESPACE = process.env.NAMESPACE;
const INSTALL_KEY = process.env.INSTALL_KEY;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const generateCustomMetadataXml = async () => {
  const exportedMetadata = require("./temp/customMetadata.json");
  const dcoreMetadata = exportedMetadata.filter(row => {
    return (
      row.fullName.startsWith(`${NAMESPACE}__`) &&
      row.namespacePrefix !== NAMESPACE
    );
  });

  const data = await fsPromises.readFile(
    "./manifests/metadataPackage.xml",
    "utf-8"
  );

  const result = await new Promise((resolve, reject) => {
    xml2js.parseString(data, (parseErr, parseResult) => {
      if (parseErr) reject(parseErr);
      resolve(parseResult);
    });
  });

  const builder = new xml2js.Builder();

  // KV Mappings
  try {
    await fsPromises.mkdir("./temp/kvm");
    await fsPromises.mkdir("./temp/actions");
    await fsPromises.mkdir("./temp/items");
    await fsPromises.mkdir("./temp/cards");
    await fsPromises.mkdir("./temp/sources");
    await fsPromises.mkdir("./temp/services");
  } catch (e) {
    //console.warn(e);
  }

  // Full Metadata backup
  result.Package.types[0].members = dcoreMetadata.map(item => {
    return item.fullName;
  });
  let builtXml = builder.buildObject(result);
  await fsPromises.writeFile("./temp/metadataPackage.xml", builtXml);

  // Key Value mappings
  result.Package.types[0].members = dcoreMetadata
    .filter(item => {
      return item.fullName.startsWith(`${NAMESPACE}__Key_Value_Mapping`);
    })
    .map(item => {
      return item.fullName;
    });

  builtXml = builder.buildObject(result);
  await fsPromises.copyFile(
    "./manifests/package.xml",
    "./temp/kvm/package.xml"
  );
  await fsPromises.writeFile("./temp/kvm/destructiveChanges.xml", builtXml);

  // delete Actions
  result.Package.types[0].members = dcoreMetadata
    .filter(item => {
      return item.fullName.startsWith(`${NAMESPACE}__Action_Definition`);
    })
    .map(item => {
      return item.fullName;
    });

  builtXml = builder.buildObject(result);
  await fsPromises.copyFile(
    "./manifests/package.xml",
    "./temp/actions/package.xml"
  );
  await fsPromises.writeFile("./temp/actions/destructiveChanges.xml", builtXml);
  // delete Data Sources
  result.Package.types[0].members = dcoreMetadata
    .filter(item => {
      return item.fullName.startsWith(`${NAMESPACE}__Data_Source`);
    })
    .map(item => {
      return item.fullName;
    });

  builtXml = builder.buildObject(result);
  await fsPromises.copyFile(
    "./manifests/package.xml",
    "./temp/sources/package.xml"
  );
  await fsPromises.writeFile("./temp/sources/destructiveChanges.xml", builtXml);

  // delete Config Items
  result.Package.types[0].members = dcoreMetadata
    .filter(item => {
      return item.fullName.startsWith(`${NAMESPACE}__Card_Configuration_Item`);
    })
    .map(item => {
      return item.fullName;
    });

  builtXml = builder.buildObject(result);
  await fsPromises.copyFile(
    "./manifests/package.xml",
    "./temp/items/package.xml"
  );
  await fsPromises.writeFile("./temp/items/destructiveChanges.xml", builtXml);

  // delete Cards
  result.Package.types[0].members = dcoreMetadata
    .filter(item => {
      return item.fullName.startsWith(`${NAMESPACE}__Card_Configuration.`);
    })
    .map(item => {
      return item.fullName;
    });

  builtXml = builder.buildObject(result);
  await fsPromises.copyFile(
    "./manifests/package.xml",
    "./temp/cards/package.xml"
  );
  await fsPromises.writeFile("./temp/cards/destructiveChanges.xml", builtXml);
  // delete Data Services
  result.Package.types[0].members = dcoreMetadata
    .filter(item => {
      return item.fullName.startsWith(`${NAMESPACE}__Data_Service`);
    })
    .map(item => {
      return item.fullName;
    });

  builtXml = builder.buildObject(result);
  await fsPromises.copyFile(
    "./manifests/package.xml",
    "./temp/services/package.xml"
  );
  await fsPromises.writeFile(
    "./temp/services/destructiveChanges.xml",
    builtXml
  );
};

(async () => {
  // create temporary folders

  try {
    await fsPromises.mkdir("./temp");
  } catch (e) {
    //console.warn(e);
  }

  // retrieve permission set assignments
  const permSetAssignments = await sfdx.force.data.soqlQuery({
    targetusername: SANDBOX_ALIAS,
    json: true,
    query: `SELECT Id,AssigneeId,PermissionSetId FROM PermissionSetAssignment WHERE PermissionSet.NamespacePrefix = '${NAMESPACE}'`,
    _quiet: false
  });

  // query metadata that references
  //SELECT Id,MetadataComponentId,MetadataComponentName,MetadataComponentType,RefMetadataComponentName,RefMetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentNamespace = 'dcorealpha'
  // Display warning/error asking user to

  // remove permission set assignments
  for (const psa of permSetAssignments.records) {
    await sfdx.force.data.recordDelete({
      targetusername: SANDBOX_ALIAS,
      sobjectid: psa.Id,
      sobjecttype: "PermissionSetAssignment",
      _quiet: false
    });
  }

  // retrieve latest account page and backup
  // Backing Up Account Page
  await sfdx.force.mdapi.retrieve({
    targetusername: SANDBOX_ALIAS,
    unpackaged: "./manifests/accountPagePackage.xml",
    retrievetargetdir: "./temp/AccountPageBackup",
    _quiet: false
  });
  // deploy original account page
  await sfdx.force.mdapi.deploy({
    targetusername: SANDBOX_ALIAS,
    wait: 30,
    deploydir: "./manifests/BlankAccountPage",
    _quiet: false
  });

  // retrieve all non-namespaced Cards
  console.log("Retrieving list of Core Connect metadata to backup.");
  await sfdx.force.mdapi.listmetadata({
    resultfile: "./temp/customMetadata.json",
    json: true,
    targetusername: SANDBOX_ALIAS,
    metadatatype: "CustomMetadata",
    _quiet: false
  });
  console.log("Generating XML for custom metadata");
  await generateCustomMetadataXml();
  // backup custom metadata
  console.log("Backing up metadata");
  await sfdx.force.mdapi.retrieve({
    unpackaged: "temp/metadataPackage.xml",
    retrievetargetdir: "./temp/customMetadataBackup",
    targetusername: SANDBOX_ALIAS,
    _quiet: false
  });
  // delete custom metadata
  console.log("deleting metadata");
  // delete KV Mappings
  await sfdx.force.mdapi.deploy({
    wait: 30,
    targetusername: SANDBOX_ALIAS,
    deploydir: "./temp/kvm",
    _quiet: false
  });
  // delete Actions
  await sfdx.force.mdapi.deploy({
    wait: 30,
    targetusername: SANDBOX_ALIAS,
    deploydir: "./temp/actions",
    _quiet: false
  });
  // delete Config Items
  await sfdx.force.mdapi.deploy({
    wait: 30,
    targetusername: SANDBOX_ALIAS,
    deploydir: "./temp/items",
    _quiet: false
  });
  // delete Cards
  await sfdx.force.mdapi.deploy({
    wait: 30,
    targetusername: SANDBOX_ALIAS,
    deploydir: "./temp/cards",
    _quiet: false
  });
  // delete Data Services
  await sfdx.force.mdapi.deploy({
    wait: 30,
    targetusername: SANDBOX_ALIAS,
    deploydir: "./temp/services",
    _quiet: false
  });
  // delete Data Sources
  await sfdx.force.mdapi.deploy({
    wait: 30,
    targetusername: SANDBOX_ALIAS,
    deploydir: "./temp/sources",
    _quiet: false
  });

  // uninstalling package
  // need id of installed package version
  //await sfdx.force.package.uninstall({});
  console.log("Uninstalling Package");
  const installedPackages = await sfdx.force.data.soqlQuery({
    targetusername: SANDBOX_ALIAS,
    usetoolingapi: true,
    json: true,
    query:
      "SELECT Id,SubscriberPackage.Name,SubscriberPackageId,SubscriberPackageVersion.Id FROM InstalledSubscriberPackage",
    _quiet: false
  });
  const coreConnectInstalledVersionId = installedPackages.records.filter(
    result => {
      return result.SubscriberPackage.Name === PACKAGE_NAME;
    }
  )[0].SubscriberPackageVersion.Id;
  await sfdx.force.package.uninstall({
    targetusername: SANDBOX_ALIAS,
    wait: 30,
    package: coreConnectInstalledVersionId,
    _quiet: false
  });

  // Install updated package

  console.log("Installing Updated Package.");
  const coreConnectPackageVersion = await sfdx.force.data.soqlQuery({
    targetusername: DEVHUB_ALIAS,
    usetoolingapi: true,
    json: true,
    query: `SELECT Id,SubscriberPackageVersionId,BuildNumber,Description,IsReleased,MajorVersion,MinorVersion,Name,Package2Id,PatchVersion FROM Package2Version WHERE Package2.Name = '${PACKAGE_NAME}' ORDER BY MajorVersion DESC,MinorVersion DESC,PatchVersion DESC, BuildNumber DESC LIMIT 1`,
    _quiet: false
  });
  const latestPackageId =
    coreConnectPackageVersion.records[0].SubscriberPackageVersionId;

  const installOptions = {
    package: latestPackageId,
    noprompt: true,
    targetusername: SANDBOX_ALIAS,
    wait: 30,
    _quiet: false
  };

  if (!NAMESPACE.includes("alpha")) {
    installOptions.installationkey = INSTALL_KEY;
  }

  await sfdx.force.package.install(installOptions);

  // Re-assign permission sets
  for (const psa of permSetAssignments.records) {
    await sfdx.force.data.recordCreate({
      targetusername: SANDBOX_ALIAS,
      sobjecttype: "PermissionSetAssignment",
      values: `AssigneeId='${psa.AssigneeId}' PermissionSetId='${psa.PermissionSetId}'`
    });
  }
  // deploy non-namespaced cards

  console.log("deploying backed up metadata");
  await sfdx.force.mdapi.deploy({
    wait: -1,
    targetusername: SANDBOX_ALIAS,
    zipfile: "./temp/customMetadataBackup/unpackaged.zip",
    _quiet: false
  });

  // Restore Lightning Page
  console.log("Restoring Lightning Page");
  await sfdx.force.mdapi.deploy({
    wait: -1,
    targetusername: SANDBOX_ALIAS,
    zipfile: "./temp/AccountPageBackup/unpackaged.zip"
  });
})();
