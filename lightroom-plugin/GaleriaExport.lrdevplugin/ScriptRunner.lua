local LrApplication = import 'LrApplication'
local LrDialogs = import 'LrDialogs'
local LrFunctionContext = import 'LrFunctionContext'
local LrProgressScope = import 'LrProgressScope'
local LrTasks = import 'LrTasks'
local LrFileUtils = import 'LrFileUtils'
local LrExportSession = import 'LrExportSession'

local EXPORT_SETTINGS = {
  max = {
    LR_export_destinationType = "specificFolder",
    LR_export_useSubfolder = false,
    LR_format = "JPEG",
    LR_jpeg_quality = 1.0,
    LR_size_doConstrain = false,
    LR_size_resolution = 300,
    LR_size_resolutionUnits = "inch",
    LR_outputSharpeningOn = true,
    LR_outputSharpeningMedia = "glossy",
    LR_outputSharpeningLevel = 2,
    LR_minimizeEmbeddedMetadata = false,
    LR_removeLocationMetadata = false,
    LR_includeVideoFiles = false,
    LR_exportServiceProvider = "com.adobe.ag.export.file",
    LR_collisionHandling = "rename",
    LR_extensionCase = "lowercase",
  },
}

local function parseJSON(str)
  local result = {}
  result.name = str:match('"name"%s*:%s*"([^"]*)"') or "Zadanie"
  result.destination = str:match('"destination"%s*:%s*"([^"]*)"')
  result.namingPattern = str:match('"namingPattern"%s*:%s*"([^"]*)"')
  result.photos = {}
  local photosStr = str:match('"photos"%s*:%s*%[([^%]]*)%]')
  if photosStr then
    for photo in photosStr:gmatch('"([^"]+)"') do
      table.insert(result.photos, photo)
    end
  end
  return result
end

local function ensureFolder(folderPath)
  if not LrFileUtils.exists(folderPath) then
    LrFileUtils.createAllDirectories(folderPath)
  end
end

local function readFile(filePath)
  local file = io.open(filePath, "r")
  if not file then return nil end
  local content = file:read("*all")
  file:close()
  return content
end

local function findPhotosByNames(catalog, searchTerms, progressScope)
  local allPhotos = catalog:getAllPhotos()
  local foundPhotos = {}
  local foundNames = {}
  progressScope:setCaption("Przeszukiwanie " .. #allPhotos .. " zdjec...")
  for i, photo in ipairs(allPhotos) do
    if progressScope:isCanceled() then break end
    if i % 500 == 0 then progressScope:setPortionComplete(i, #allPhotos) end
    local filename = photo:getFormattedMetadata('fileName')
    for _, term in ipairs(searchTerms) do
      if filename and filename:find(term, 1, true) and not foundNames[term] then
        table.insert(foundPhotos, photo)
        foundNames[term] = true
        break
      end
    end
  end
  return foundPhotos, foundNames
end

local function exportBatch(photos, settings, dest, pattern, progress)
  local s = {}
  for k, v in pairs(settings) do s[k] = v end
  s.LR_export_destinationPathPrefix = dest
  if pattern then s.LR_renamingTokensOn = true s.LR_tokens = pattern end
  local session = LrExportSession({ photosToExport = photos, exportSettings = s })
  local count = 0
  for _, r in session:renditions() do
    if progress:isCanceled() then break end
    r:waitForRender()
    count = count + 1
    progress:setPortionComplete(count, #photos)
  end
  return count
end

local function runScript()
  LrTasks.startAsyncTask(function()
    local files = LrDialogs.runOpenPanel({
      title = "Wybierz skrypt (.galeria)",
      canChooseFiles = true,
      canChooseDirectories = false,
      allowsMultipleSelection = false,
      fileTypes = { "galeria", "json", "txt" },
    })
    if not files or #files == 0 then return end
    local content = readFile(files[1])
    if not content then
      LrDialogs.message("Blad", "Nie mozna odczytac pliku.", "critical")
      return
    end
    local script = parseJSON(content)
    if not script.destination or #script.photos == 0 then
      LrDialogs.message("Blad", "Skrypt niepoprawny.", "critical")
      return
    end
    local ok = LrDialogs.confirm(script.name, "Zdjec: " .. #script.photos, "Szukaj", "Anuluj")
    if ok ~= "ok" then return end
    local catalog = LrApplication.activeCatalog()
    LrFunctionContext.callWithContext("export", function(ctx)
      local prog = LrProgressScope({ title = script.name, functionContext = ctx, canBeCanceled = true })
      local found, names = findPhotosByNames(catalog, script.photos, prog)
      if #found == 0 then
        prog:done()
        LrDialogs.message("Brak", "Nie znaleziono zdjec.", "critical")
        return
      end
      local msg = "Znaleziono: " .. #found .. "/" .. #script.photos
      if LrDialogs.confirm("Wynik", msg, "Eksportuj", "Anuluj") ~= "ok" then
        prog:done()
        return
      end
      ensureFolder(script.destination:gsub("\\", "/"))
      prog:setCaption("Eksport MAX...")
      local exp = exportBatch(found, EXPORT_SETTINGS.max, script.destination:gsub("\\", "/"), script.namingPattern, prog)
      prog:done()
      LrDialogs.message("Gotowe!", "Wyeksportowano: " .. exp, "info")
      LrTasks.execute('start "" "' .. script.destination:gsub("/", "\\") .. '"')
    end)
  end)
end

runScript()