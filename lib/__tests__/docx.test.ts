import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractDocx, isDocx, looksLikeZip } from "../docx";

// Собирает минимальный .docx (zip) в памяти под нужды теста.
async function makeDocx(files: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [p, data] of Object.entries(files)) zip.file(p, data);
  return zip.generateAsync({ type: "nodebuffer" });
}

const documentXml =
  '<?xml version="1.0"?><w:document><w:body>' +
  "<w:p><w:r><w:t>Первый абзац.</w:t></w:r></w:p>" +
  "<w:p><w:r><w:t>Второй &amp; абзац</w:t></w:r></w:p>" +
  "</w:body></w:document>";

test("extractDocx pulls plain text from document.xml", async () => {
  const buf = await makeDocx({ "word/document.xml": documentXml });
  const { text } = await extractDocx(buf);
  assert.match(text, /Первый абзац\./);
  assert.match(text, /Второй & абзац/); // сущность раскодирована
  assert.match(text, /\n/); // абзацы разделены переводом строки
});

test("extractDocx keeps usable images and drops junk", async () => {
  const big = Buffer.alloc(9000, 1); // > minImageBytes (8 КБ)
  const tiny = Buffer.alloc(100, 1); // иконка/буллет — мельче порога
  const buf = await makeDocx({
    "word/document.xml": documentXml,
    "word/media/image1.png": big,
    "word/media/image2.emf": big, // формат без поддержки → пропуск
    "word/media/image3.png": tiny, // слишком мелкая → пропуск
  });

  const { images } = await extractDocx(buf);
  assert.equal(images.length, 1);
  assert.equal(images[0].ext, "png");
  assert.equal(images[0].mime, "image/png");
});

test("extractDocx respects maxImages cap", async () => {
  const big = Buffer.alloc(9000, 1);
  const buf = await makeDocx({
    "word/document.xml": documentXml,
    "word/media/image1.png": big,
    "word/media/image2.png": big,
    "word/media/image3.png": big,
  });
  const { images } = await extractDocx(buf, { maxImages: 2 });
  assert.equal(images.length, 2);
});

test("isDocx accepts a real docx zip and rejects junk", async () => {
  const buf = await makeDocx({ "word/document.xml": documentXml });
  assert.equal(await isDocx(buf), true);
  assert.equal(await isDocx(Buffer.from("not a zip")), false);
  // zip без word/document.xml — не docx
  const notDocx = await makeDocx({ "hello.txt": "hi" });
  assert.equal(await isDocx(notDocx), false);
});

test("looksLikeZip detects PK signature", () => {
  assert.equal(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(looksLikeZip(new Uint8Array([0x00, 0x01, 0x02, 0x03])), false);
});
