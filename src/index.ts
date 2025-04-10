import fs from 'fs';

import { DatDatabase } from "./dat/DatDatabase";
import { Texture } from "./dat/Texture";
import SeekableFileReader from "./seekable_file_reader";
import { DatFileType } from "./dat/DatFileType";
import { DatFile } from "./dat/DatFile";
import sharp from 'sharp';
import BinaryReader from './binary_reader';
import { DatReader } from './dat/DatReader';
import { SpellTable } from './dat/SpellTable';

const exportIcons = function (portal_path: string, files: DatFile[], path: string) {
  if (!fs.existsSync(`./${path}`)) {
    fs.mkdirSync(`./${path}`);
  }

  for (let i = 0; i < files.length; i++) {
    let file = files[i];


    if (!file.ObjectId) {
      throw new Error("file had missing object id");
    }

    if (file.type() != DatFileType.Texture && file.FileSize != 4120) {
      continue;
    }


    // Skip icons we don't want

    let id_short = file.ObjectId - 0x6000000;

    if (id_short != 0x0F5A) {
      continue;
    }

    console.log(file.FileOffset);
    let file_reader = new SeekableFileReader(portal_path, file.FileOffset);
    let icon = new Texture();
    icon.unpack(file_reader);

    console.log(`"Form is ${icon.form}`);

    if (icon.form == 10) {
      console.log("RGB");
    } else if (icon.form == 6) {
      console.log("RGBA");
    } else {
      throw new Error("TODO");
    }

    if (!icon.width || !icon.height || !icon.buffer) {
      throw new Error("TODO")
    }

    let npixels = icon.width * icon.height;

    let rawBuffer = Buffer.from(icon.buffer)

    for (let i = 0; i < npixels / 4; i++) {

      let ir = i * 4;
      let ib = i * 4 + 1
      let ig = i * 4 + 2;
      let ia = i * 4 + 3;

      let nr = i * 4 + 1;
      let nb = i * 4 + 2
      let ng = i * 4 + 3;
      let na = i;

      console.log({
        ir, ig, ib, ia
      })

      let olda = rawBuffer[ia];
      let oldr = rawBuffer[ir];
      let oldg = rawBuffer[ig];
      let oldb = rawBuffer[ib];

      rawBuffer[na] = olda;
      rawBuffer[nr] = oldr;
      rawBuffer[ng] = oldg;
      rawBuffer[nb] = oldb;
    }

    sharp(rawBuffer, {
      raw: {
        width: icon.width,
        height: icon.height,
        channels: 4,
      }
    }).png().toFile(`./${path}/${id_short}.png`);
  }
}

const createCloudflareIndex = function (files: DatFile[]) {
  for (let i = 0; i < files.length; i++) {
    let file = files[i];

    if (file.type() != DatFileType.Texture && file.FileSize != 4120) {
      continue;
    }

    if (!file.ObjectId) {
      break;
    }

    let id = file.ObjectId;
    let id_short = file.ObjectId - 0x6000000;

    console.log(`insert into files(id, id_short, offset, size, dat_type) values(${id}, ${id_short}, ${file.FileOffset}, 4120, 0); `);
  }
}

const main = function () {
  const portal_path = "../ACEmulator/ACE/Dats/client_portal.dat";
  const cell_path = "../ACEmulator/ACE/Dats/client_cell_1.dat";

  if (!fs.existsSync(portal_path)) {
    console.log(`portal doesn't exist at ${portal_path}, exiting`);

    return;
  };

  if (!fs.existsSync(cell_path)) {
    console.log(`cell doesn't exist at ${cell_path}, exiting`);

    return;
  };

  const db = new DatDatabase(portal_path);
  db.read();

  let files: DatFile[] = [];
  db.rootDir?.files(files);

  for (let i = 0; i < files.length; i++) {
    let file = files[i];

    // console.log("file.type_name());

    if (file.type() == DatFileType.SpellTable) {
      console.log("spell table:: ", { file });

      let file_reader = new SeekableFileReader(portal_path, file.FileOffset);
      let spell_table = new SpellTable();
      spell_table.unpack(file_reader);

      console.log(spell_table);

      break;
    }

  }

  db.close();

}

main();
