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

const migrateDependency = async (
  fileName,
  fileContent,
  metadataType,
  newNamespace
) => {
  let newFileContent = fileContent;
  switch (metadataType) {
    case "ApexClass":
      newFileContent = newFileContent.replace(
        CONTEXT_PROVIDER_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      newFileContent = newFileContent.replace(
        DATA_SOURCE_PROVIDER_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      newFileContent = newFileContent.replace(
        APEX_DATA_PROVIDER_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      newFileContent = newFileContent.replace(
        OVERRIDE_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      newFileContent = newFileContent.replace(
        APEX_DEFAULT_CONTEXT_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      break;
    case "AuraDefinitionBundle":
      newFileContent = newFileContent.replace(
        AURA_MULTICARD_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      newFileContent = newFileContent.replace(
        AURA_SINGLECARD_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      break;
    case "LightningComponentBundle":
      if (fileName.endsWith(".html")) {
        newFileContent = newFileContent.replace(
          LWC_FLEXICARD_REGEX,
          "$&".replaceAll(NAMESPACE, newNamespace)
        );
      } else if (fileName.endsWith(".js")) {
        newFileContent = newFileContent.replace(
          LWC_CARD_EXTENSION_IMPORT_REGEX,
          "$&".replaceAll(NAMESPACE, newNamespace)
        );
        newFileContent = newFileContent.replace(
          LWC_CARD_EXTENSION_EXTENDS_REGEX,
          "$&".replaceAll(NAMESPACE, newNamespace)
        );
      }
      break;
    case "FlexiPage":
      newFileContent = newFileContent.replace(
        MULTICARD_COMPONENT_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
      newFileContent = newFileContent.replace(
        SINGLECARD_COMPONENT_REGEX,
        "$&".replaceAll(NAMESPACE, newNamespace)
      );
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

export {
  getPackageFile,
  asyncForEach,
  convertUnixPathToWindows,
  removeFileExtension,
  extractDependency,
  EMPTY_PACKAGE_XML,
};
