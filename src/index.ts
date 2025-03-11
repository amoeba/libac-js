import fs from 'fs';
import path from 'path';

import { DatDatabase } from "./dat/DatDatabase";
import { Texture } from "./dat/Texture";
import SeekableFileReader from "./seekable_file_reader";
import { DatFileType } from "./dat/DatFileType";
import { DatFile } from "./dat/DatFile";

const exportIcons = function (portal_path: string, files: DatFile[], path: string) {
  if (!fs.existsSync(`./${path}`)) {
    fs.mkdirSync(`./${path}`);
  }

  for (let i = 0; i < files.length; i++) {
    let file = files[i];

    if (file.type() != DatFileType.Texture) {
      continue;
    }

    let file_reader = new SeekableFileReader(portal_path, file.FileOffset);
    let icon = new Texture();
    icon.unpack(file_reader);
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

    console.log(`insert into files (id, id_short, offset, size, dat_type) values (${id}, ${id_short}, ${file.FileOffset}, 4120, 0);`);
  }
}

const main = function () {
  const portal_path = "/Users/bryce/src/ACEmulator/ACE/Dats/client_portal.dat";
  const cell_path = "/Users/bryce/src/ACEmulator/ACE/Dats/client_cell_1.dat";

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
  db.close();
}

main();
