const sfdx = require("sfdx-node");
const fs = require("fs");
const xml2js = require("xml2js");

const SANDBOX_ALIAS = "chcd71";

const generateCustomMetadataXml = () => {
  return new Promise((resolve, reject) => {
    const exportedMetadata = require("./customMetadata.json");
    const dcoreMetadata = exportedMetadata.filter(row => {
      return (
        row.fullName.startsWith("dcorealpha__") &&
        row.namespacePrefix !== "dcorealpha"
      );
    });

    fs.readFile("metadataPackage.xml", "utf-8", (err, data) => {
      if (err) reject(err);
      xml2js.parseString(data, (parseErr, result) => {
        if (err) reject(parseErr);
        result.Package.types[0].members = dcoreMetadata.map(item => {
          return item.fullName;
        });
        const builder = new xml2js.Builder();
        const builtXml = builder.buildObject(result);
        fs.writeFile(
          "metadataPackage.xml",
          builtXml,
          (writeErr, writtenData) => {
            if (writeErr) reject(writeErr);
            fs.writeFile(
              "temp/destructiveChanges.xml",
              builtXml,
              (writeErr2, writtenData2) => {
                if (writeErr2) reject(writeErr2);
                resolve(true);
              }
            );
          }
        );
      });
    });
  });
};

(async () => {
  // retrieve latest account page and backup

  // deploy original account page
  // retrieve all non-namespaced Cards
  console.log("Retrieving list of Core Connect metadata to backup.");
  await sfdx.force.mdapi.listmetadata({
    resultfile: "customMetadata.json",
    json: true,
    targetusername: SANDBOX_ALIAS,
    metadatatype: "CustomMetadata"
  });
  console.log("Generating XML for custom metadata");
  await generateCustomMetadataXml();
  // backup custom metadata
  console.log("Backing up metadata");
  await sfdx.force.mdapi.retrieve({
    unpackaged: "temp/destructiveChanges.xml",
    retrievetargetdir: "./customMetadataBackup",
    targetusername: SANDBOX_ALIAS
  });
  // delete custom metadata
  console.log("deleting metadata");
  await sfdx.force.mdapi.deploy({
    wait: -1,
    targetusername: SANDBOX_ALIAS,
    deploydir: "temp"
  });
  // deploy non-namespaced cards
  console.log("deploying backed up metadata");
  await sfdx.force.mdapi.deploy({
    wait: -1,
    targetusername: SANDBOX_ALIAS,
    zipfile: "./customMetadataBackup/unpackaged.zip",
    _quiet: false
  });
})();
