const fs = require("fs");
const fsPromises = fs.promises;
const xml2js = require("xml2js");

const NAMESPACE = process.env.NAMESPACE;

const generateCustomMetadataXml = async () => {
  const exportedMetadata = require("./temp/customMetadata.json");
  const dcoreMetadata = exportedMetadata.filter((row) => {
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
  result.Package.types[0].members = dcoreMetadata.map((item) => {
    return item.fullName;
  });
  let builtXml = builder.buildObject(result);
  await fsPromises.writeFile("./temp/metadataPackage.xml", builtXml);

  // Key Value mappings
  result.Package.types[0].members = dcoreMetadata
    .filter((item) => {
      return item.fullName.startsWith(`${NAMESPACE}__Key_Value_Mapping`);
    })
    .map((item) => {
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
    .filter((item) => {
      return item.fullName.startsWith(`${NAMESPACE}__Action_Definition`);
    })
    .map((item) => {
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
    .filter((item) => {
      return item.fullName.startsWith(`${NAMESPACE}__Data_Source`);
    })
    .map((item) => {
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
    .filter((item) => {
      return item.fullName.startsWith(`${NAMESPACE}__Card_Configuration_Item`);
    })
    .map((item) => {
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
    .filter((item) => {
      return item.fullName.startsWith(`${NAMESPACE}__Card_Configuration.`);
    })
    .map((item) => {
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
    .filter((item) => {
      return item.fullName.startsWith(`${NAMESPACE}__Data_Service`);
    })
    .map((item) => {
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
  await generateCustomMetadataXml();
})();
