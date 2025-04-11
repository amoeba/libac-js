import BinaryReader from "./BinaryReader";
import SeekableFileReader from "./SeekableFileReader";

const fs = require('fs');

// Constants. TODO: Move elsewhere
const DAT_FILE_OBJECT_SIZE = 0xC0; // 4 * 6 == 24 == 0xC0
