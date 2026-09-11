'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { validPath } = require('../ConfigModel.js');
const { failure } = require('./result.cjs');
const MAX_IMAGE_BYTES = 128 * 1024 * 1024;

// Container/MIME checks, not a replacement for the renderer's actual decoder.
function imageType(bytes) {
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    if (bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13 || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20)) return null;
    let offset = 8;
    let pixels = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      const tag = bytes.toString('ascii', offset + 4, offset + 8);
      if (size > bytes.length - offset - 12) return null;
      if (tag === 'acTL') throw failure('unsupported-image', 'Animated PNG is not supported.', 2);
      if (tag === 'IDAT') pixels = true;
      offset += size + 12;
      if (tag === 'IEND') return pixels && size === 0 && offset === bytes.length ? { mime: 'image/png', extension: 'png' } : null;
    }
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9)
    return { mime: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
    let offset = 12;
    let pixels = false;
    while (offset + 8 <= bytes.length) {
      const tag = bytes.toString('ascii', offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      if (size > bytes.length - offset - 8) return null;
      if (tag === 'ANIM' || tag === 'ANMF' || (tag === 'VP8X' && size >= 1 && (bytes[offset + 8] & 2)))
        throw failure('unsupported-image', 'Animated WebP is not supported.', 2);
      if (tag === 'VP8 ' || tag === 'VP8L') pixels = size > 0;
      offset += 8 + size + (size % 2);
    }
    return pixels && offset === bytes.length ? { mime: 'image/webp', extension: 'webp' } : null;
  }
  return null;
}

function inspectImage(file, io = fs) {
  if (!validPath(file)) throw failure('unsupported-image', 'Use an absolute PNG/JPEG/WebP image path.', 2);
  let fd;
  try {
    fd = io.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const before = io.fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > MAX_IMAGE_BYTES)
      throw failure('unsupported-image', 'Image must be a regular file between 1 byte and 128 MiB: ' + file, 2);
    const bytes = Buffer.alloc(before.size);
    let read = 0;
    while (read < bytes.length) {
      const count = io.readSync(fd, bytes, read, bytes.length - read, null);
      if (!count) break;
      read += count;
    }
    const after = io.fstatSync(fd);
    if (read !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)
      throw failure('source-changed', 'Image changed during validation; inspect and retry: ' + file, 4);
    const type = imageType(bytes);
    if (!type) throw failure('unsupported-image', 'Unsupported or malformed image container: ' + file, 2);
    const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase().replace('jpeg', 'jpg');
    if (extension !== type.extension) throw failure('unsupported-image', 'Image extension does not match its MIME signature: ' + file, 2);
    return { path: file, ...type, hash: crypto.createHash('sha256').update(bytes).digest('hex'), bytes };
  } catch (error) {
    if (error.exitCode) throw error;
    throw failure('image-unavailable', `Cannot read image ${JSON.stringify(file)} (${error.code || 'I/O error'}).`, 2);
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
}

function validateImages(config, io = fs) {
  const seen = new Map();
  const images = Object.create(null);
  for (const key of Object.keys(config.assignments)) {
    const source = config.assignments[key];
    if (!seen.has(source)) {
      const { bytes, ...metadata } = inspectImage(source, io);
      seen.set(source, metadata);
    }
    images[key] = seen.get(source);
  }
  return images;
}
module.exports = { MAX_IMAGE_BYTES, imageType, inspectImage, validateImages };
