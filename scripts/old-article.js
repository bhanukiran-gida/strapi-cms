const fs = require("fs-extra");
const path = require("path");
const mime = require("mime-types");

const sourcePath = path.join("scrap-data", "articles");

const accessToken =
  "f8ab92ed73b0ca6d0a536895c47b61c96530608e85bd06fa845dc3697b8b5152e9a815a43a0083e289ce3f0e7c8567b564990cd62c82102e5388f5a32d5c945c68f1f15ec56c4129c45818a25166b7634bef1b37c6eb1966105a6412667ea89970ce59352e309fc625f5ca4d97c6ad9cad64abf92c299d9564fa9ccc0d794ea3";

const chunkSize = 1;

const waitMs = 200;

async function importSeedData() {
  let categoryMap = await importAllCategories();
  console.log(categoryMap);
  await importOldArticles(categoryMap);
}

// >blogs>car-insurance>0001-number-plate.json

function getCategoryFromName(item) {
  const splittedName = item.split(">");
  // const category = splittedName[Math.max(splittedName.length - 2, 0)];
  let idx = 0;
  for (item of splittedName) {
    idx++;
    if (item === "blogs") {
      break;
    }
  }
  return idx < splittedName.length - 1 ? splittedName[idx] : null;
}

async function importAllCategories() {
  let categoryMap = {};
  const categoryNames = fs
    .readdirSync(sourcePath, { withFileTypes: true })
    .filter((item) => !item.isDirectory())
    .map((item) => getCategoryFromName(item.name))
    .filter((res) => !!res);
  const set = new Set(categoryNames);
  let idx = 0;
  for (const category of set.values()) {
    const data = {
      name: category.replaceAll("-", " "),
      slug: category,
    };
    try {
      const doc = await createOrGetEntry({ model: "category", entry: data });
      if (!doc) throw new Error("Failed to create the category");
      categoryMap = { ...categoryMap, [category]: doc.documentId };
    } catch (err) {
      console.error(idx, category, err);
    }
    idx++;
  }

  return categoryMap;
}

async function createOrGetEntry({ model, entry }) {
  const doc = await strapi
    .documents(`api::${model}.${model}`)
    .findFirst({
      filters: { slug: { $eq: entry.slug } },
      fields: ["documentId", "slug"],
      populate: "*",
    })
    .catch(() => null);

  if (doc) {
    if (model === "old-article" && doc.image == null) {
      return await strapi.documents(`api::${model}.${model}`).update({
        documentId: doc.documentId,
        data: {
          image: entry.image,
        },
      });
    }

    return doc;
  }

  try {
    return await strapi.documents(`api::${model}.${model}`).create({
      data: entry,
    });
  } catch (error) {
    throw error;
  }
}

async function uploadFile(file, name) {
  try {
    const fileWhereName = await strapi.query("plugin::upload.file").findOne({
      where: {
        name: name,
      },
    });

    if (fileWhereName) {
      return [fileWhereName];
    }

    const formData = new FormData();
    formData.append("files", file);
    formData.append("data", {});
    formData.append("name", name);

    const uploadResponse = await fetch("http://localhost:1337/api/upload/", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await uploadResponse.json();

    return data;
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

function chunkizeArray(array, chunkSize = 5) {
  return Array.from({ length: Math.ceil(array.length / chunkSize) }, (_, i) =>
    array.slice(i * chunkSize, i * chunkSize + chunkSize)
  );
}

async function importOldArticles(categoryMap) {
  const filenames = fs
    .readdirSync(sourcePath, { withFileTypes: true })
    .filter((item) => !item.isDirectory())
    .map((item) => item.name);

  const array = chunkizeArray(filenames, chunkSize);

  let addedFilesCount = 0;

  for (let arrayIdx = 0; arrayIdx < array.length; arrayIdx++) {
    if (arrayIdx !== 0) {
      console.log(`waiting for ${waitMs}m-secs ${addedFilesCount} done`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const chunk = array[arrayIdx];

    const promises = chunk.map(async (fileName, idx) => {
      const fileData = getFileData(fileName, categoryMap);

      if (!fileData.title || !fileData.slug) return;

      if (fileData.imageUrl) {
        const fileNameNoExtension = fileData.imageUrl
          .split("/")
          .pop()
          .split(".")
          .shift();

        const blob = await fetch(fileData.imageUrl, {
          method: "GET",
          headers: {},
        })
          .then((res) =>
            res.status < 300 && res.status >= 200 ? res.blob() : undefined
          )
          .catch((err) => console.error(arrayIdx * chunkSize + idx, err));

        if (blob) {
          const file = new File([blob], fileNameNoExtension, {
            type: `image/${fileData.imageUrl
              .split(".")
              .pop()
              .replace("jpg", "jpeg")}`,
          });
          const res = await uploadFile(file, fileNameNoExtension).catch(
            (err) => {
              console.error(arrayIdx * chunkSize + idx, err);
              return [];
            }
          );

          const uploadedFile = res?.length ? res[0] : undefined;

          delete fileData["imageUrl"];

          if (uploadedFile) {
            const article = {
              ...fileData,
              image: uploadedFile,
            };
            await createOrGetEntry({
              model: "old-article",
              entry: article,
            })
              .then(() => {
                addedFilesCount++;
              })
              .catch((err) => console.error(arrayIdx * chunkSize + idx, err));
            return;
          } else {
            console.error(
              arrayIdx * chunkSize + idx,
              "Failed to upload downloaded image, creating doc without image"
            );
          }
        }
        await createOrGetEntry({
          model: "old-article",
          entry: fileData,
        })
          .then(() => {
            addedFilesCount++;
          })
          .catch((err) => console.error(arrayIdx * chunkSize + idx, err));
      } else {
        await createOrGetEntry({ model: "old-article", entry: fileData })
          .then(() => {
            addedFilesCount++;
          })
          .catch((err) => console.error(arrayIdx * chunkSize + idx, err));
      }
    });
    await Promise.all(promises);
  }
}

const dateTimeParser = (data) => {
  const [date, minRead, author] = data.split("|");

  return {
    date: date?.replace("Posted on:", "")?.trim(),
    minRead: minRead?.trim() || null,
    author: author?.replace("Written by:", "")?.trim() || null,
  };
};

function getFileData(file, categoryMap) {
  const filePath = path.join(sourcePath, file);
  let rawdata = fs.readFileSync(filePath);
  let json = JSON.parse(rawdata);

  const heading = json["heading"];
  const dateAndMinsRead = json["dateAndMinsRead"];
  const imageUrl = json["image"];
  const content = json["content"];
  const title = json["title"];
  const metaDescription = json["metaDescription"];
  const ogTitle = json["ogTitle"];
  const ogType = json["ogType"];
  const ogUrl = json["ogUrl"];
  const ogSiteName = json["ogSiteName"];

  const { date, minRead, author } = dateTimeParser(dateAndMinsRead || "");

  const splittedFileName = file.split(">");

  const slugName = splittedFileName.pop().split(".").shift();
  const categoryName = getCategoryFromName(file);

  const data = {
    title: heading,
    postedOn: date
      ? new Date(date).toISOString().split("T").shift()
      : undefined,
    slug: categoryName ? `${categoryName}_${slugName}` : slugName,
    content,
    timeToRead: minRead,
    author: author,
    imageUrl,
    ...(categoryName
      ? {
          category: {
            connect: [categoryMap[categoryName]],
          },
        }
      : {}),
    metaFields: {
      title: title.replace("\n", "").replace("\t", ""),
      metaDescription,
      ogTitle,
      ogType,
      ogUrl,
      ogSiteName,
    },
  };

  return data;
}

async function main() {
  const { createStrapi, compileStrapi } = require("@strapi/strapi");

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  app.log.level = "error";

  await importSeedData();
  await app.destroy();

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
