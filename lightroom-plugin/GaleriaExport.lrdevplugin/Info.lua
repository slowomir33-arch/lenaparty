return {
  LrSdkVersion = 5.0,
  LrSdkMinimumVersion = 4.0,
  LrToolkitIdentifier = 'pl.lenaparty.galeriaexport',
  LrPluginName = 'Galeria Online Export',
  LrPluginInfoUrl = 'https://lenaparty.pl',
  
  LrExportMenuItems = {
    {
      title = "Eksportuj albumy (Light + Max)",
      file = "ExportCollections.lua",
    },
    {
      title = "Uruchom skrypt zadania...",
      file = "ScriptRunner.lua",
    },
  },
  
  VERSION = { major = 1, minor = 1, revision = 0, build = 1 },
}