export enum DatFileType {
  Unknown = 0, // WIP, not sure if I want to keep this
  LandBlock = 1,
  LandBlockInfo = 2,
  EnvCell = 3,
  LandBlockObjects = 4,
  Instantiation = 5,
  GraphicsObject = 6,
  Setup = 7,
  Animation = 8,
  AnimationHook = 9,
  Palette = 10,
  SurfaceTexture = 11,
  Texture = 12,
  Surface = 13,
  MotionTable = 14,
  Wave = 15,
  Environment = 16,
  ChatPoseTable = 17,
  ObjectHierarchy = 18,
  BadData = 19,
  TabooTable = 20,
  FileToId = 21,
  NameFilterTable = 22,
  MonitoredProperties = 23,
  PaletteSet = 24,
  Clothing = 25,
  DegradeInfo = 26,
  Scene = 27,
  Region = 28,
  KeyMap = 29,
  RenderTexture = 30,
  RenderMaterial = 31,
  MaterialModifier = 32,
  MaterialInstance = 33,
  SoundTable = 34,
  UiLayout = 35,
  EnumMapper = 36,
  StringTable = 37,
  DidMapper = 38,
  ActionMap = 39,
  DualDidMapper = 40,
  String = 41,
  ParticleEmitter = 42,
  PhysicsScript = 43,
  PhysicsScriptTable = 44,
  MasterProperty = 45,
  Font = 46,
  FontLocal = 47,
  StringState = 48,
  DbProperties = 49,
  RenderMesh = 67,
  WeenieDefaults = 0x10000001,
  CharacterGenerator = 0x10000002,
  SecondaryAttributeTable = 0x10000003,
  SkillTable = 0x10000004,
  SpellTable = 0x10000005,
  SpellComponentTable = 0x10000006,
  TreasureTable = 0x10000007,
  CraftTable = 0x10000008,
  XpTable = 0x10000009,
  Quests = 0x1000000A,
  GameEventTable = 0x1000000B,
  QualityFilter = 0x1000000C,
  CombatTable = 0x1000000D,
  ItemMutation = 0x1000000E,
  ContractTable = 0x10000010,
}

export const getFileType = function (id: number): DatFileType {
  if (id >= 0x01000000 && id <= 0x0100FFFF) {
    return DatFileType.GraphicsObject
  } else if (id >= 0x02000000 && id <= 0x0200FFFF) {
    return DatFileType.Setup
  } else if (id >= 0x03000000 && id <= 0x0300FFFF) {
    return DatFileType.Animation
  } else if (id >= 0x04000000 && id <= 0x0400FFFF) {
    return DatFileType.Palette
  } else if (id >= 0x05000000 && id <= 0x05FFFFFF) {
    return DatFileType.SurfaceTexture
  } else if (id >= 0x06000000 && id <= 0x07FFFFFF) {
    return DatFileType.Texture
  } else if (id >= 0x08000000 && id <= 0x0800FFFF) {
    return DatFileType.Surface
  } else if (id >= 0x09000000 && id <= 0x0900FFFF) {
    return DatFileType.MotionTable
  } else if (id >= 0x0A000000 && id <= 0x0A00FFFF) {
    return DatFileType.Wave
  } else if (id >= 0x0D000000 && id <= 0x0D00FFFF) {
    return DatFileType.Environment
  } else if (id >= 0x0E000007 && id <= 0x0E000007) {
    return DatFileType.ChatPoseTable
  } else if (id >= 0x0E00000D && id <= 0x0E00000D) {
    return DatFileType.ObjectHierarchy
  } else if (id >= 0x0E00001A && id <= 0x0E00001A) {
    return DatFileType.BadData
  } else if (id >= 0x0E00001E && id <= 0x0E00001E) {
    return DatFileType.TabooTable
  } else if (id >= 0x0E00001F && id <= 0x0E00001F) {
    return DatFileType.FileToId
  } else if (id >= 0x0E000020 && id <= 0x0E000020) {
    return DatFileType.NameFilterTable
  } else if (id >= 0x0E020000 && id <= 0x0E02FFFF) {
    return DatFileType.MonitoredProperties
  } else if (id >= 0x0F000000 && id <= 0x0F00FFFF) {
    return DatFileType.PaletteSet
  } else if (id >= 0x10000000 && id <= 0x1000FFFF) {
    return DatFileType.Clothing
  } else if (id >= 0x11000000 && id <= 0x1100FFFF) {
    return DatFileType.DegradeInfo
  } else if (id >= 0x12000000 && id <= 0x1200FFFF) {
    return DatFileType.Scene
  } else if (id >= 0x13000000 && id <= 0x1300FFFF) {
    return DatFileType.Region
  } else if (id >= 0x14000000 && id <= 0x1400FFFF) {
    return DatFileType.KeyMap
  } else if (id >= 0x15000000 && id <= 0x15FFFFFF) {
    return DatFileType.RenderTexture
  } else if (id >= 0x16000000 && id <= 0x16FFFFFF) {
    return DatFileType.RenderMaterial
  } else if (id >= 0x17000000 && id <= 0x17FFFFFF) {
    return DatFileType.MaterialModifier
  } else if (id >= 0x18000000 && id <= 0x18FFFFFF) {
    return DatFileType.MaterialInstance
  } else if (id >= 0x20000000 && id <= 0x2000FFFF) {
    return DatFileType.SoundTable
  } else if (id >= 0x21000000 && id <= 0x21FFFFFF) {
    return DatFileType.UiLayout
  } else if (id >= 0x22000000 && id <= 0x22FFFFFF) {
    return DatFileType.EnumMapper
  } else if (id >= 0x23000000 && id <= 0x24FFFFFF) {
    return DatFileType.StringTable
  } else if (id >= 0x25000000 && id <= 0x25FFFFFF) {
    return DatFileType.DidMapper
  } else if (id >= 0x26000000 && id <= 0x2600FFFF) {
    return DatFileType.ActionMap
  } else if (id >= 0x27000000 && id <= 0x27FFFFFF) {
    return DatFileType.DualDidMapper
  } else if (id >= 0x31000000 && id <= 0x3100FFFF) {
    return DatFileType.String
  } else if (id >= 0x32000000 && id <= 0x3200FFFF) {
    return DatFileType.ParticleEmitter
  } else if (id >= 0x33000000 && id <= 0x3300FFFF) {
    return DatFileType.PhysicsScript
  } else if (id >= 0x34000000 && id <= 0x3400FFFF) {
    return DatFileType.PhysicsScriptTable
  } else if (id >= 0x39000000 && id <= 0x39FFFFFF) {
    return DatFileType.MasterProperty
  } else if (id >= 0x40000000 && id <= 0x40000FFF) {
    return DatFileType.Font
  } else if (id >= 0x40001000 && id <= 0x400FFFFF) {
    return DatFileType.FontLocal
  } else if (id >= 0x41000000 && id <= 0x41FFFFFF) {
    return DatFileType.StringState
  } else if (id >= 0x78000000 && id <= 0x7FFFFFFF) {
    return DatFileType.DbProperties
  } else if (id >= 0x19000000 && id <= 0x19FFFFFF) {
    return DatFileType.RenderMesh
  } else if (id >= 0x00000001 && id <= 0x0000FFFF) {
    return DatFileType.WeenieDefaults
  } else if (id >= 0x0E000002 && id <= 0x0E000002) {
    return DatFileType.CharacterGenerator
  } else if (id >= 0x0E000003 && id <= 0x0E000003) {
    return DatFileType.SecondaryAttributeTable
  } else if (id >= 0x0E000004 && id <= 0x0E000004) {
    return DatFileType.SkillTable
  } else if (id >= 0x0E00000E && id <= 0x0E00000E) {
    return DatFileType.SpellTable
  } else if (id >= 0x0E00000F && id <= 0x0E00000F) {
    return DatFileType.SpellComponentTable
  } else if (id >= 0x0E000011 && id <= 0x0E000011) {
    return DatFileType.TreasureTable
  } else if (id >= 0x0E000019 && id <= 0x0E000019) {
    return DatFileType.CraftTable
  } else if (id >= 0x0E000018 && id <= 0x0E000018) {
    return DatFileType.XpTable
  } else if (id >= 0x0E00001B && id <= 0x0E00001B) {
    return DatFileType.Quests
  } else if (id >= 0x0E00001C && id <= 0x0E00001C) {
    return DatFileType.GameEventTable
  } else if (id >= 0x0E010000 && id <= 0x0E01FFFF) {
    return DatFileType.QualityFilter
  } else if (id >= 0x30000000 && id <= 0x3000FFFF) {
    return DatFileType.CombatTable
  } else if (id >= 0x38000000 && id <= 0x3800FFFF) {
    return DatFileType.ItemMutation
  } else if (id >= 0x0E00001D && id <= 0x0E00001D) {
    return DatFileType.ContractTable
  }

  return DatFileType.Unknown
}

export const getFileTypeName = function (id: DatFileType): string {
  return DatFileType[id];
}
