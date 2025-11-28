--[[
  Galeria Online Export Plugin
  Automatyczny eksport kolekcji do struktury light/max
  
  SZYBKA WERSJA - używa batch export z natywnym nazewnictwem LR
  
  Użycie:
  1. Zaznacz Collection Set w Lightroom
  2. File > Plug-in Extras > Eksportuj albumy (Light + Max)
  3. Wybierz które albumy chcesz wyeksportować
  4. Skonfiguruj szablon nazewnictwa plików
  5. Wybierz folder docelowy
  6. Plugin wyeksportuje wybrane albumy z podziałem na light i max
]]

local LrApplication = import 'LrApplication'
local LrDialogs = import 'LrDialogs'
local LrFunctionContext = import 'LrFunctionContext'
local LrProgressScope = import 'LrProgressScope'
local LrTasks = import 'LrTasks'
local LrPathUtils = import 'LrPathUtils'
local LrFileUtils = import 'LrFileUtils'
local LrExportSession = import 'LrExportSession'
local LrView = import 'LrView'
local LrBinding = import 'LrBinding'
local LrColor = import 'LrColor'

-- ============================================
-- SZABLONY NAZEWNICTWA (mapowane na tokeny LR)
-- ============================================

local NAMING_TEMPLATES = {
  { 
    name = "Oryginalna nazwa",
    lrTokens = "{{image_name}}",
    preview = "DSC_1234.jpg"
  },
  { 
    name = "Numer sekwencyjny (001, 002...)",
    lrTokens = "{{sequence_001}}",
    preview = "001.jpg"
  },
  { 
    name = "Data + Numer",
    lrTokens = "{{date_YYYY}}-{{date_MM}}-{{date_DD}}_{{sequence_001}}",
    preview = "2025-11-28_001.jpg"
  },
  { 
    name = "Oryginalna + Numer",
    lrTokens = "{{image_name}}_{{sequence_001}}",
    preview = "DSC_1234_001.jpg"
  },
  { 
    name = "Data + Oryginalna",
    lrTokens = "{{date_YYYY}}-{{date_MM}}-{{date_DD}}_{{image_name}}",
    preview = "2025-11-28_DSC_1234.jpg"
  },
  { 
    name = "Własny tekst + Numer",
    lrTokens = "custom",
    preview = "MojeZdjecie_001.jpg",
    needsCustomText = true
  },
}

-- ============================================
-- KONFIGURACJA EKSPORTU
-- ============================================

local EXPORT_SETTINGS = {
  light = {
    LR_export_destinationType = "specificFolder",
    LR_export_useSubfolder = false,
    LR_format = "JPEG",
    LR_jpeg_quality = 0.85,
    LR_size_doConstrain = true,
    LR_size_maxHeight = 1800,
    LR_size_maxWidth = 1800,
    LR_size_resizeType = "longEdge",
    LR_size_units = "pixels",
    LR_size_resolution = 72,
    LR_size_resolutionUnits = "inch",
    LR_outputSharpeningOn = true,
    LR_outputSharpeningMedia = "screen",
    LR_outputSharpeningLevel = 2,
    LR_minimizeEmbeddedMetadata = false,
    LR_removeLocationMetadata = false,
    LR_includeVideoFiles = false,
    LR_exportServiceProvider = "com.adobe.ag.export.file",
    LR_collisionHandling = "rename",
    LR_extensionCase = "lowercase",
  },
  
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

-- ============================================
-- FUNKCJE POMOCNICZE
-- ============================================

local function getCollectionsFromSet(collectionSet)
  local collections = {}
  
  local childCollections = collectionSet:getChildCollections()
  for _, collection in ipairs(childCollections) do
    table.insert(collections, collection)
  end
  
  local childSets = collectionSet:getChildCollectionSets()
  for _, childSet in ipairs(childSets) do
    local nestedCollections = getCollectionsFromSet(childSet)
    for _, collection in ipairs(nestedCollections) do
      table.insert(collections, collection)
    end
  end
  
  return collections
end

local function ensureFolder(folderPath)
  if not LrFileUtils.exists(folderPath) then
    LrFileUtils.createAllDirectories(folderPath)
  end
end

-- SZYBKI EKSPORT - jedna sesja dla wszystkich zdjęć
local function exportPhotosBatch(photos, exportSettings, destinationFolder, namingTokens, progressScope, progressBase, progressTotal)
  -- Przygotuj ustawienia
  local settings = {}
  for k, v in pairs(exportSettings) do
    settings[k] = v
  end
  settings.LR_export_destinationPathPrefix = destinationFolder
  
  -- Ustaw nazewnictwo
  if namingTokens and namingTokens ~= "" then
    settings.LR_renamingTokensOn = true
    settings.LR_tokens = namingTokens
    settings.LR_initialSequenceNumber = 1
  else
    settings.LR_renamingTokensOn = false
  end
  
  -- JEDNA sesja eksportu dla wszystkich zdjęć!
  local exportSession = LrExportSession({
    photosToExport = photos,
    exportSettings = settings,
  })
  
  local photoCount = #photos
  local exported = 0
  
  for _, rendition in exportSession:renditions() do
    rendition:waitForRender()
    exported = exported + 1
    
    if progressScope then
      local progress = progressBase + (exported / photoCount) * progressTotal
      progressScope:setPortionComplete(progress, 1)
    end
  end
  
  return exported
end

-- ============================================
-- DIALOG WYBORU
-- ============================================

local function showSelectionDialog(allCollections)
  local selectedCollections = {}
  local selectedNamingTokens = NAMING_TEMPLATES[1].lrTokens
  
  LrFunctionContext.callWithContext("selectionDialog", function(dialogContext)
    local props = LrBinding.makePropertyTable(dialogContext)
    
    -- Domyślnie zaznacz wszystkie albumy
    for i = 1, #allCollections do
      props["selected_" .. i] = true
    end
    props.selectAll = true
    props.namingPreset = 1
    props.customPrefix = "Zdjecie"
    props.filenamePreview = NAMING_TEMPLATES[1].preview
    
    -- Aktualizacja podglądu
    local function updatePreview()
      local template = NAMING_TEMPLATES[props.namingPreset]
      if template.needsCustomText then
        props.filenamePreview = props.customPrefix .. "_001.jpg"
      else
        props.filenamePreview = template.preview
      end
    end
    
    props:addObserver("namingPreset", updatePreview)
    props:addObserver("customPrefix", updatePreview)
    
    local f = LrView.osFactory()
    
    -- Lista albumów
    local checkboxRows = {}
    
    table.insert(checkboxRows, f:row {
      f:checkbox {
        title = "Zaznacz / Odznacz wszystkie",
        value = LrView.bind("selectAll"),
        font = "<system/bold>",
      },
    })
    
    table.insert(checkboxRows, f:separator { fill_horizontal = 1 })
    
    for i, collection in ipairs(allCollections) do
      local photos = collection:getPhotos()
      table.insert(checkboxRows, f:row {
        f:checkbox {
          title = string.format("%s (%d zdjęć)", collection:getName(), #photos),
          value = LrView.bind("selected_" .. i),
          width = 380,
        },
      })
    end
    
    props:addObserver("selectAll", function(properties, key, newValue)
      for i = 1, #allCollections do
        properties["selected_" .. i] = newValue
      end
    end)
    
    -- Lista szablonów
    local namingPresetItems = {}
    for i, preset in ipairs(NAMING_TEMPLATES) do
      table.insert(namingPresetItems, { title = preset.name, value = i })
    end
    
    -- Dialog
    local dialogContent = f:column {
      spacing = f:control_spacing(),
      bind_to_object = props,
      
      f:static_text {
        title = "📁 Wybierz albumy do eksportu:",
        font = "<system/bold>",
      },
      
      f:scrolled_view {
        width = 500,
        height = 180,
        f:column(checkboxRows),
      },
      
      f:separator { fill_horizontal = 1 },
      
      f:static_text {
        title = "📝 Nazewnictwo plików:",
        font = "<system/bold>",
      },
      
      f:row {
        f:static_text { title = "Szablon:", width = 80 },
        f:popup_menu {
          items = namingPresetItems,
          value = LrView.bind("namingPreset"),
          width = 250,
        },
      },
      
      f:row {
        f:static_text { title = "Prefix:", width = 80 },
        f:edit_field {
          value = LrView.bind("customPrefix"),
          width = 200,
          enabled = LrBinding.keyEquals("namingPreset", 6),
        },
        f:static_text {
          title = "(tylko dla 'Własny tekst')",
          text_color = LrColor(0.5, 0.5, 0.5),
        },
      },
      
      f:separator { fill_horizontal = 1 },
      
      f:row {
        f:static_text { title = "👁 Podgląd:", font = "<system/bold>", width = 80 },
        f:static_text {
          title = LrView.bind("filenamePreview"),
          font = "<system/bold>",
          text_color = LrColor(0.2, 0.6, 0.2),
        },
      },
      
      f:separator { fill_horizontal = 1 },
      
      f:static_text { title = "⚙️ Ustawienia eksportu:", font = "<system/bold>" },
      f:static_text { title = "• Light: 1800px, JPEG 85%, 72 DPI" },
      f:static_text { title = "• Max: Oryginalny rozmiar, JPEG 100%, 300 DPI" },
    }
    
    local result = LrDialogs.presentModalDialog({
      title = "Galeria Online - Eksport albumów",
      contents = dialogContent,
      actionVerb = "Wybierz folder i eksportuj",
      cancelVerb = "Anuluj",
    })
    
    if result == "ok" then
      for i, collection in ipairs(allCollections) do
        if props["selected_" .. i] then
          table.insert(selectedCollections, collection)
        end
      end
      
      local template = NAMING_TEMPLATES[props.namingPreset]
      if template.needsCustomText then
        selectedNamingTokens = props.customPrefix .. "_{{sequence_001}}"
      else
        selectedNamingTokens = template.lrTokens
      end
    end
  end)
  
  return selectedCollections, selectedNamingTokens
end

-- ============================================
-- EKSPORT Z POSTĘPEM
-- ============================================

local function doExportWithProgress(selectedCollections, destinationFolder, namingTokens)
  LrFunctionContext.callWithContext("exportProgress", function(context)
    local progressScope = LrProgressScope({
      title = "Eksport albumów do Galeria Online",
      functionContext = context,
    })
    
    local totalCollections = #selectedCollections
    local exportedPhotos = 0
    
    for collectionIndex, collection in ipairs(selectedCollections) do
      local collectionName = collection:getName()
      local photos = collection:getPhotos()
      
      if #photos > 0 then
        -- Utwórz foldery
        local albumFolder = LrPathUtils.child(destinationFolder, collectionName)
        local lightFolder = LrPathUtils.child(albumFolder, "light")
        local maxFolder = LrPathUtils.child(albumFolder, "max")
        
        ensureFolder(lightFolder)
        ensureFolder(maxFolder)
        
        -- LIGHT - batch export
        progressScope:setCaption(string.format("%s - Light (%d/%d)", collectionName, collectionIndex, totalCollections))
        local baseProgress = (collectionIndex - 1) / totalCollections
        exportPhotosBatch(photos, EXPORT_SETTINGS.light, lightFolder, namingTokens, progressScope, baseProgress, 0.5 / totalCollections)
        
        -- MAX - batch export
        progressScope:setCaption(string.format("%s - Max (%d/%d)", collectionName, collectionIndex, totalCollections))
        exportPhotosBatch(photos, EXPORT_SETTINGS.max, maxFolder, namingTokens, progressScope, baseProgress + 0.5 / totalCollections, 0.5 / totalCollections)
        
        exportedPhotos = exportedPhotos + #photos
      end
      
      if progressScope:isCanceled() then break end
    end
    
    progressScope:done()
    
    if not progressScope:isCanceled() then
      LrDialogs.message(
        "Eksport zakończony!",
        string.format(
          "Wyeksportowano %d zdjęć z %d albumów.\n\nPliki zapisane w:\n%s",
          exportedPhotos * 2,
          totalCollections,
          destinationFolder
        ),
        "info"
      )
      
      LrTasks.execute('start "" "' .. destinationFolder .. '"')
    end
  end)
end

-- ============================================
-- GŁÓWNA FUNKCJA
-- ============================================

local function exportCollections()
  LrTasks.startAsyncTask(function()
    local catalog = LrApplication.activeCatalog()
    local sources = catalog:getActiveSources()
    
    if #sources == 0 then
      LrDialogs.message("Błąd", "Najpierw zaznacz Collection Set lub kolekcję w panelu po lewej stronie.", "critical")
      return
    end
    
    local allCollections = {}
    
    for _, source in ipairs(sources) do
      if source:type() == "LrCollectionSet" then
        local collections = getCollectionsFromSet(source)
        for _, collection in ipairs(collections) do
          table.insert(allCollections, collection)
        end
      elseif source:type() == "LrCollection" then
        table.insert(allCollections, source)
      end
    end
    
    if #allCollections == 0 then
      LrDialogs.message("Błąd", "Nie znaleziono żadnych kolekcji do eksportu.", "critical")
      return
    end
    
    local selectedCollections, namingTokens = showSelectionDialog(allCollections)
    
    if #selectedCollections == 0 then return end
    
    local destinationFolder = LrDialogs.runOpenPanel({
      title = "Wybierz folder docelowy dla eksportu",
      canChooseFiles = false,
      canChooseDirectories = true,
      canCreateDirectories = true,
      allowsMultipleSelection = false,
    })
    
    if not destinationFolder or #destinationFolder == 0 then return end
    
    doExportWithProgress(selectedCollections, destinationFolder[1], namingTokens)
  end)
end

exportCollections()
