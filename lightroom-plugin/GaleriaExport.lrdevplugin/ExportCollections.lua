--[[
  Galeria Online Export Plugin
  Automatyczny eksport kolekcji do struktury light/max
  
  Użycie:
  1. Zaznacz Collection Set w Lightroom
  2. File > Plug-in Extras > Eksportuj albumy (Light + Max)
  3. Wybierz które albumy chcesz wyeksportować
  4. Wybierz folder docelowy
  5. Plugin wyeksportuje wybrane albumy z podziałem na light i max
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
-- KONFIGURACJA EKSPORTU
-- ============================================

local EXPORT_SETTINGS = {
  -- Ustawienia dla wersji LIGHT (do internetu)
  light = {
    LR_export_destinationType = "specificFolder",
    LR_export_useSubfolder = false,
    LR_format = "JPEG",
    LR_jpeg_quality = 0.85,           -- 85% jakości
    LR_size_doConstrain = true,
    LR_size_maxHeight = 1800,
    LR_size_maxWidth = 1800,
    LR_size_resizeType = "longEdge",
    LR_size_units = "pixels",
    LR_size_resolution = 72,          -- 72 DPI dla internetu
    LR_size_resolutionUnits = "inch",
    LR_outputSharpeningOn = true,
    LR_outputSharpeningMedia = "screen",
    LR_outputSharpeningLevel = 2,     -- Standard
    LR_minimizeEmbeddedMetadata = false,
    LR_removeLocationMetadata = false,
    LR_includeVideoFiles = false,
    LR_exportServiceProvider = "com.adobe.ag.export.file",
    LR_collisionHandling = "rename",
    LR_extensionCase = "lowercase",
    LR_initialSequenceNumber = 1,
    LR_renamingTokensOn = false,
  },
  
  -- Ustawienia dla wersji MAX (do druku)
  max = {
    LR_export_destinationType = "specificFolder",
    LR_export_useSubfolder = false,
    LR_format = "JPEG",
    LR_jpeg_quality = 1.0,            -- 100% jakości
    LR_size_doConstrain = false,      -- Oryginalny rozmiar
    LR_size_resolution = 300,         -- 300 DPI do druku
    LR_size_resolutionUnits = "inch",
    LR_outputSharpeningOn = true,
    LR_outputSharpeningMedia = "glossy",
    LR_outputSharpeningLevel = 2,     -- Standard
    LR_minimizeEmbeddedMetadata = false,
    LR_removeLocationMetadata = false,
    LR_includeVideoFiles = false,
    LR_exportServiceProvider = "com.adobe.ag.export.file",
    LR_collisionHandling = "rename",
    LR_extensionCase = "lowercase",
    LR_initialSequenceNumber = 1,
    LR_renamingTokensOn = false,
  },
}

-- ============================================
-- FUNKCJE POMOCNICZE
-- ============================================

-- Pobiera wszystkie kolekcje z Collection Set (rekurencyjnie)
local function getCollectionsFromSet(collectionSet)
  local collections = {}
  
  -- Pobierz bezpośrednie kolekcje
  local childCollections = collectionSet:getChildCollections()
  for _, collection in ipairs(childCollections) do
    table.insert(collections, collection)
  end
  
  -- Pobierz kolekcje z zagnieżdżonych setów
  local childSets = collectionSet:getChildCollectionSets()
  for _, childSet in ipairs(childSets) do
    local nestedCollections = getCollectionsFromSet(childSet)
    for _, collection in ipairs(nestedCollections) do
      table.insert(collections, collection)
    end
  end
  
  return collections
end

-- Tworzy folder jeśli nie istnieje
local function ensureFolder(folderPath)
  if not LrFileUtils.exists(folderPath) then
    LrFileUtils.createAllDirectories(folderPath)
  end
end

-- Eksportuje zdjęcia z kolekcji
local function exportPhotos(photos, exportSettings, progressScope, progressBase, progressTotal)
  local exportSession = LrExportSession({
    photosToExport = photos,
    exportSettings = exportSettings,
  })
  
  local photoCount = #photos
  local exported = 0
  
  for _, rendition in exportSession:renditions() do
    local success, pathOrMessage = rendition:waitForRender()
    exported = exported + 1
    
    if progressScope then
      local progress = progressBase + (exported / photoCount) * progressTotal
      progressScope:setPortionComplete(progress, 1)
    end
    
    if not success then
      LrDialogs.message("Błąd eksportu", "Nie udało się wyeksportować: " .. tostring(pathOrMessage), "warning")
    end
  end
  
  return exported
end

-- ============================================
-- DIALOG WYBORU ALBUMÓW (osobna funkcja)
-- ============================================

local function showSelectionDialog(allCollections)
  local selectedCollections = {}
  
  LrFunctionContext.callWithContext("selectionDialog", function(dialogContext)
    local props = LrBinding.makePropertyTable(dialogContext)
    
    -- Domyślnie zaznacz wszystkie
    for i = 1, #allCollections do
      props["selected_" .. i] = true
    end
    props.selectAll = true
    
    local f = LrView.osFactory()
    
    -- Buduj listę checkboxów
    local checkboxRows = {}
    
    -- Przycisk zaznacz/odznacz wszystko
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
      local photoCount = #photos
      
      table.insert(checkboxRows, f:row {
        f:checkbox {
          title = string.format("%s (%d zdjęć)", collection:getName(), photoCount),
          value = LrView.bind("selected_" .. i),
          width = 400,
        },
      })
    end
    
    -- Observer dla "zaznacz wszystko"
    props:addObserver("selectAll", function(properties, key, newValue)
      for i = 1, #allCollections do
        properties["selected_" .. i] = newValue
      end
    end)
    
    local dialogContent = f:column {
      spacing = f:control_spacing(),
      bind_to_object = props,
      
      f:static_text {
        title = "Wybierz albumy do eksportu:",
        font = "<system/bold>",
      },
      
      f:static_text {
        title = "Każdy album zostanie wyeksportowany do folderów light/ i max/",
      },
      
      f:separator { fill_horizontal = 1 },
      
      f:scrolled_view {
        width = 450,
        height = 300,
        f:column(checkboxRows),
      },
      
      f:separator { fill_horizontal = 1 },
      
      f:row {
        f:static_text {
          title = "Ustawienia eksportu:",
          font = "<system/bold>",
        },
      },
      
      f:row {
        f:static_text {
          title = "• Light: 1800px, JPEG 85%, 72 DPI, wyostrzanie screen",
        },
      },
      
      f:row {
        f:static_text {
          title = "• Max: Oryginalny rozmiar, JPEG 100%, 300 DPI, wyostrzanie glossy",
        },
      },
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
    end
  end)
  
  return selectedCollections
end

-- ============================================
-- EKSPORT Z PASKIEM POSTĘPU (osobna funkcja)
-- ============================================

local function doExportWithProgress(selectedCollections, destinationFolder)
  LrFunctionContext.callWithContext("exportProgress", function(context)
    local progressScope = LrProgressScope({
      title = "Eksport albumów do Galeria Online",
      functionContext = context,
    })
    
    local totalCollections = #selectedCollections
    local exportedPhotos = 0
    
    -- Eksportuj każdą kolekcję
    for collectionIndex, collection in ipairs(selectedCollections) do
      local collectionName = collection:getName()
      local photos = collection:getPhotos()
      
      if #photos > 0 then
        progressScope:setCaption(string.format(
          "Eksportowanie: %s (%d/%d)",
          collectionName,
          collectionIndex,
          totalCollections
        ))
        
        -- Utwórz foldery
        local albumFolder = LrPathUtils.child(destinationFolder, collectionName)
        local lightFolder = LrPathUtils.child(albumFolder, "light")
        local maxFolder = LrPathUtils.child(albumFolder, "max")
        
        ensureFolder(lightFolder)
        ensureFolder(maxFolder)
        
        -- Eksportuj wersję LIGHT
        local lightSettings = {}
        for k, v in pairs(EXPORT_SETTINGS.light) do
          lightSettings[k] = v
        end
        lightSettings.LR_export_destinationPathPrefix = lightFolder
        
        progressScope:setCaption(string.format(
          "%s - Light (%d/%d)",
          collectionName,
          collectionIndex,
          totalCollections
        ))
        
        local baseProgress = (collectionIndex - 1) / totalCollections
        exportPhotos(photos, lightSettings, progressScope, baseProgress, 0.5 / totalCollections)
        
        -- Eksportuj wersję MAX
        local maxSettings = {}
        for k, v in pairs(EXPORT_SETTINGS.max) do
          maxSettings[k] = v
        end
        maxSettings.LR_export_destinationPathPrefix = maxFolder
        
        progressScope:setCaption(string.format(
          "%s - Max (%d/%d)",
          collectionName,
          collectionIndex,
          totalCollections
        ))
        
        exportPhotos(photos, maxSettings, progressScope, baseProgress + 0.5 / totalCollections, 0.5 / totalCollections)
        
        exportedPhotos = exportedPhotos + #photos
      end
      
      -- Sprawdź czy użytkownik nie anulował
      if progressScope:isCanceled() then
        break
      end
    end
    
    progressScope:done()
    
    -- Pokaż podsumowanie
    if not progressScope:isCanceled() then
      LrDialogs.message(
        "Eksport zakończony!",
        string.format(
          "Wyeksportowano %d zdjęć z %d albumów.\n\nPliki zapisane w:\n%s\n\nStruktura:\n• [album]/light/ - do internetu\n• [album]/max/ - do druku",
          exportedPhotos * 2,  -- *2 bo light + max
          totalCollections,
          destinationFolder
        ),
        "info"
      )
      
      -- Otwórz folder w eksploratorze
      LrTasks.execute('start "" "' .. destinationFolder .. '"')
    end
  end)
end

-- ============================================
-- GŁÓWNA FUNKCJA EKSPORTU
-- ============================================

local function exportCollections()
  LrTasks.startAsyncTask(function()
    -- Pobierz aktywny katalog
    local catalog = LrApplication.activeCatalog()
    
    -- Pobierz zaznaczone źródła (kolekcje lub sety)
    local sources = catalog:getActiveSources()
    
    if #sources == 0 then
      LrDialogs.message("Błąd", "Najpierw zaznacz Collection Set lub kolekcję w panelu po lewej stronie.", "critical")
      return
    end
    
    -- Zbierz wszystkie kolekcje do eksportu
    local allCollections = {}
    
    for _, source in ipairs(sources) do
      if source:type() == "LrCollectionSet" then
        -- To jest Collection Set - pobierz wszystkie kolekcje
        local collections = getCollectionsFromSet(source)
        for _, collection in ipairs(collections) do
          table.insert(allCollections, collection)
        end
      elseif source:type() == "LrCollection" then
        -- To jest pojedyncza kolekcja
        table.insert(allCollections, source)
      end
    end
    
    if #allCollections == 0 then
      LrDialogs.message("Błąd", "Nie znaleziono żadnych kolekcji do eksportu.", "critical")
      return
    end
    
    -- Pokaż dialog wyboru (w osobnym kontekście)
    local selectedCollections = showSelectionDialog(allCollections)
    
    -- Sprawdź czy coś wybrano
    if #selectedCollections == 0 then
      return
    end
    
    -- Wybierz folder docelowy
    local destinationFolder = LrDialogs.runOpenPanel({
      title = "Wybierz folder docelowy dla eksportu",
      canChooseFiles = false,
      canChooseDirectories = true,
      canCreateDirectories = true,
      allowsMultipleSelection = false,
    })
    
    if not destinationFolder or #destinationFolder == 0 then
      return
    end
    
    destinationFolder = destinationFolder[1]
    
    -- Wykonaj eksport z paskiem postępu (w osobnym kontekście)
    doExportWithProgress(selectedCollections, destinationFolder)
  end)
end

-- Uruchom eksport
exportCollections()
