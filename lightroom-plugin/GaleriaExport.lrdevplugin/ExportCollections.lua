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
-- TOKENY DO BUDOWANIA NAZWY (kafelki)
-- ============================================

local NAMING_TOKENS = {
  { id = "album", label = "📁 Nazwa albumu", token = "ALBUM_NAME", preview = "NazwaAlbumu", isAlbumName = true },
  { id = "name", label = "📷 Oryginalna nazwa", token = "{{image_name}}", preview = "DSC_1234" },
  { id = "seq", label = "🔢 Numer (001)", token = "{{sequence_001}}", preview = "001" },
  { id = "date", label = "📅 Data", token = "{{date_YYYY}}-{{date_MM}}-{{date_DD}}", preview = "2025-11-28" },
  { id = "year", label = "📆 Rok", token = "{{date_YYYY}}", preview = "2025" },
  { id = "custom", label = "✏️ Własny tekst", token = "custom", preview = "MójTekst" },
  { id = "sep_dash", label = "➖ Myślnik -", token = "-", preview = "-" },
  { id = "sep_under", label = "▪️ Podkreślnik _", token = "_", preview = "_" },
}

-- Szybkie predefiniowane szablony
local QUICK_TEMPLATES = {
  { name = "🏷️ Oryginalna nazwa", tokens = { "name" } },
  { name = "🔢 Tylko numer", tokens = { "seq" } },
  { name = "📁 Album + Numer", tokens = { "album", "sep_under", "seq" } },
  { name = "📅 Data + Numer", tokens = { "date", "sep_under", "seq" } },
  { name = "📷 Nazwa + Numer", tokens = { "name", "sep_under", "seq" } },
  { name = "📁 Album + Nazwa", tokens = { "album", "sep_under", "name" } },
  { name = "✏️ Własny + Numer", tokens = { "custom", "sep_under", "seq" } },
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

-- Funkcja pomocnicza do zamiany spacji na podkreślniki
local function sanitizeText(text)
  if not text then return "" end
  -- Zamień spacje na podkreślniki
  local result = string.gsub(text, " ", "_")
  -- Usuń podwójne podkreślniki
  result = string.gsub(result, "__+", "_")
  -- Usuń podkreślniki na początku i końcu
  result = string.gsub(result, "^_+", "")
  result = string.gsub(result, "_+$", "")
  return result
end

-- Funkcja do budowania tokena LR z listy wybranych tokenów
local function buildTokenString(selectedTokens, customText, albumName)
  local result = ""
  local safeCustomText = sanitizeText(customText)
  local safeAlbumName = sanitizeText(albumName)
  
  for _, tokenId in ipairs(selectedTokens) do
    for _, token in ipairs(NAMING_TOKENS) do
      if token.id == tokenId then
        if token.id == "custom" then
          result = result .. safeCustomText
        elseif token.isAlbumName then
          result = result .. (safeAlbumName ~= "" and safeAlbumName or "Album")
        else
          result = result .. token.token
        end
        break
      end
    end
  end
  return result
end

-- Funkcja do generowania podglądu
local function buildPreviewString(selectedTokens, customText, albumName)
  local result = ""
  local safeCustomText = sanitizeText(customText)
  local safeAlbumName = sanitizeText(albumName)
  
  for _, tokenId in ipairs(selectedTokens) do
    for _, token in ipairs(NAMING_TOKENS) do
      if token.id == tokenId then
        if token.id == "custom" then
          result = result .. (safeCustomText ~= "" and safeCustomText or "MojTekst")
        elseif token.isAlbumName then
          result = result .. (safeAlbumName ~= "" and safeAlbumName or "NazwaAlbumu")
        else
          result = result .. token.preview
        end
        break
      end
    end
  end
  return result .. ".jpg"
end

local function showSelectionDialog(allCollections)
  local selectedCollections = {}
  local namingConfig = {
    tokens = { "name" },
    customText = "MojeZdjecie"
  }
  
  LrFunctionContext.callWithContext("selectionDialog", function(dialogContext)
    local props = LrBinding.makePropertyTable(dialogContext)
    
    -- Domyślnie zaznacz wszystkie albumy
    for i = 1, #allCollections do
      props["selected_" .. i] = true
    end
    props.selectAll = true
    
    -- Aktywne tokeny (tablica ID tokenów w kolejności)
    props.activeTokens = { "name" }  -- Domyślnie oryginalna nazwa
    props.customText = "MojeZdjecie"
    props.filenamePreview = "DSC_1234.jpg"
    props.activeTokensDisplay = "📷 Oryginalna nazwa"
    props.quickTemplate = 1
    
    -- Funkcja odświeżająca wyświetlanie aktywnych tokenów i podgląd
    local function refreshDisplay()
      local displayParts = {}
      local previewParts = {}
      local safeCustomText = sanitizeText(props.customText)
      
      for _, tokenId in ipairs(props.activeTokens) do
        for _, token in ipairs(NAMING_TOKENS) do
          if token.id == tokenId then
            table.insert(displayParts, token.label)
            if token.id == "custom" then
              table.insert(previewParts, safeCustomText ~= "" and safeCustomText or "MojTekst")
            else
              table.insert(previewParts, token.preview)
            end
            break
          end
        end
      end
      
      if #displayParts > 0 then
        props.activeTokensDisplay = table.concat(displayParts, " ➔ ")
        props.filenamePreview = table.concat(previewParts, "") .. ".jpg"
      else
        props.activeTokensDisplay = "(brak - kliknij tokeny poniżej)"
        props.filenamePreview = "(wybierz elementy nazwy)"
      end
    end
    
    -- Funkcja dodająca token
    local function addToken(tokenId)
      local newTokens = {}
      for _, t in ipairs(props.activeTokens) do
        table.insert(newTokens, t)
      end
      table.insert(newTokens, tokenId)
      props.activeTokens = newTokens
      refreshDisplay()
    end
    
    -- Funkcja usuwająca ostatni token
    local function removeLastToken()
      if #props.activeTokens > 0 then
        local newTokens = {}
        for i = 1, #props.activeTokens - 1 do
          table.insert(newTokens, props.activeTokens[i])
        end
        props.activeTokens = newTokens
        refreshDisplay()
      end
    end
    
    -- Funkcja czyszcząca wszystkie tokeny
    local function clearAllTokens()
      props.activeTokens = {}
      refreshDisplay()
    end
    
    -- Funkcja ustawiająca szybki szablon
    local function applyQuickTemplate(templateIndex)
      local template = QUICK_TEMPLATES[templateIndex]
      if template then
        props.activeTokens = {}
        for _, tokenId in ipairs(template.tokens) do
          table.insert(props.activeTokens, tokenId)
        end
        refreshDisplay()
      end
    end
    
    props:addObserver("customText", refreshDisplay)
    props:addObserver("quickTemplate", function()
      applyQuickTemplate(props.quickTemplate)
    end)
    
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
    
    -- Szybkie szablony
    local quickTemplateItems = {}
    for i, template in ipairs(QUICK_TEMPLATES) do
      table.insert(quickTemplateItems, { title = template.name, value = i })
    end
    
    -- Przyciski tokenów (kafelki)
    local tokenButtons = {}
    for _, token in ipairs(NAMING_TOKENS) do
      table.insert(tokenButtons, f:push_button {
        title = token.label,
        width = 150,
        action = function()
          addToken(token.id)
        end,
      })
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
        width = 540,
        height = 150,
        f:column(checkboxRows),
      },
      
      f:separator { fill_horizontal = 1 },
      
      -- SEKCJA NAZEWNICTWA
      f:static_text {
        title = "🏷️ Buduj nazwę pliku:",
        font = "<system/bold>",
      },
      
      -- Szybki wybór
      f:row {
        f:static_text { title = "Szybki szablon:", width = 100 },
        f:popup_menu {
          items = quickTemplateItems,
          value = LrView.bind("quickTemplate"),
          width = 200,
        },
      },
      
      f:separator { fill_horizontal = 1 },
      
      -- Kafelki tokenów - rząd 1
      f:row {
        spacing = f:label_spacing(),
        tokenButtons[1], -- Album
        tokenButtons[2], -- Oryginalna nazwa
        tokenButtons[3], -- Numer
      },
      
      -- Kafelki tokenów - rząd 2
      f:row {
        spacing = f:label_spacing(),
        tokenButtons[4], -- Data
        tokenButtons[5], -- Rok
        tokenButtons[6], -- Własny tekst
      },
      
      -- Separatory
      f:row {
        spacing = f:label_spacing(),
        tokenButtons[7], -- Myślnik
        tokenButtons[8], -- Podkreślnik
        f:push_button {
          title = "⬅️ Cofnij",
          width = 80,
          action = removeLastToken,
        },
        f:push_button {
          title = "🗑️ Wyczyść",
          width = 80,
          action = clearAllTokens,
        },
      },
      
      f:separator { fill_horizontal = 1 },
      
      -- Własny tekst
      f:row {
        f:static_text { title = "Własny tekst:", width = 100 },
        f:edit_field {
          value = LrView.bind("customText"),
          width = 300,
          height_in_lines = 1,
        },
      },
      f:row {
        f:static_text { title = "", width = 100 },
        f:static_text {
          title = "Spacje zostaną zamienione na podkreślniki",
          text_color = LrColor(0.5, 0.5, 0.5),
        },
      },
      
      f:separator { fill_horizontal = 1 },
      
      -- Aktualny szablon
      f:row {
        f:static_text { title = "Szablon:", width = 100, font = "<system/bold>" },
        f:static_text {
          title = LrView.bind("activeTokensDisplay"),
          width = 400,
          text_color = LrColor(0.2, 0.4, 0.8),
        },
      },
      
      -- Podgląd
      f:row {
        f:static_text { title = "👁 Podgląd:", width = 100, font = "<system/bold>" },
        f:static_text {
          title = LrView.bind("filenamePreview"),
          font = "<system/bold>",
          text_color = LrColor(0.1, 0.6, 0.1),
        },
      },
      
      f:separator { fill_horizontal = 1 },
      
      -- Ustawienia eksportu
      f:static_text { title = "⚙️ Ustawienia eksportu:", font = "<system/bold>" },
      f:row {
        f:static_text { title = "• Light: 1800px, JPEG 85%, 72 DPI", text_color = LrColor(0.4, 0.4, 0.4) },
      },
      f:row {
        f:static_text { title = "• Max: Oryginalny rozmiar, JPEG 100%, 300 DPI", text_color = LrColor(0.4, 0.4, 0.4) },
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
      
      -- Zapisz konfigurację nazewnictwa (tokeny + własny tekst)
      namingConfig.tokens = {}
      for _, t in ipairs(props.activeTokens) do
        table.insert(namingConfig.tokens, t)
      end
      namingConfig.customText = props.customText
    end
  end)
  
  return selectedCollections, namingConfig
end

-- ============================================
-- EKSPORT Z POSTĘPEM
-- ============================================

local function doExportWithProgress(selectedCollections, destinationFolder, namingConfig)
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
        -- Zbuduj nazewnictwo z nazwą albumu
        local namingTokens = buildTokenString(namingConfig.tokens, namingConfig.customText, collectionName)
        if namingTokens == "" then
          namingTokens = "{{image_name}}"
        end
        
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
    
    local selectedCollections, namingConfig = showSelectionDialog(allCollections)
    
    if #selectedCollections == 0 then return end
    
    local destinationFolder = LrDialogs.runOpenPanel({
      title = "Wybierz folder docelowy dla eksportu",
      canChooseFiles = false,
      canChooseDirectories = true,
      canCreateDirectories = true,
      allowsMultipleSelection = false,
    })
    
    if not destinationFolder or #destinationFolder == 0 then return end
    
    doExportWithProgress(selectedCollections, destinationFolder[1], namingConfig)
  end)
end

exportCollections()
