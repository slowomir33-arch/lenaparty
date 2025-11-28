# Galeria Online - Lightroom Export Plugin

Plugin do Adobe Lightroom Classic automatyzujący eksport kolekcji do struktury `light/max` dla Galeria Online.

## Instalacja

### Metoda 1: Plugin Manager (zalecana)
1. Otwórz Lightroom Classic
2. Idź do **File > Plug-in Manager...**
3. Kliknij **Add**
4. Wybierz folder `GaleriaExport.lrdevplugin`
5. Kliknij **Done**

### Metoda 2: Ręczna instalacja
1. Skopiuj folder `GaleriaExport.lrdevplugin` do:
   - **Windows**: `C:\Users\[TwojaNazwa]\AppData\Roaming\Adobe\Lightroom\Modules\`
   - **Mac**: `~/Library/Application Support/Adobe/Lightroom/Modules/`
2. Uruchom ponownie Lightroom

## Użycie

1. W panelu **Collections** (lewa strona) zaznacz **Collection Set** lub pojedynczą kolekcję
2. Idź do **File > Plug-in Extras > Eksportuj albumy (Light + Max)**
3. **Wybierz albumy** do eksportu z listy (checkboxy)
4. Kliknij **"Wybierz folder i eksportuj"**
5. Wybierz folder docelowy
6. Poczekaj na zakończenie eksportu

## Struktura wynikowa

```
[Folder docelowy]/
├── Album 1/
│   ├── light/
│   │   ├── foto1.jpg
│   │   ├── foto2.jpg
│   │   └── ...
│   └── max/
│       ├── foto1.jpg
│       ├── foto2.jpg
│       └── ...
├── Album 2/
│   ├── light/
│   └── max/
└── ...
```

## Ustawienia eksportu

### Light (do internetu)
- **Format**: JPEG
- **Jakość**: 85%
- **Rozmiar**: Dłuższa krawędź 1800px
- **Wyostrzanie**: Screen, Standard

### Max (do druku)
- **Format**: JPEG
- **Jakość**: 100%
- **Rozmiar**: Oryginalny (bez zmian)
- **Wyostrzanie**: Glossy, Standard

## Modyfikacja ustawień

Jeśli chcesz zmienić ustawienia eksportu:

1. Otwórz plik `ExportCollections.lua` w edytorze tekstu
2. Znajdź sekcję `EXPORT_SETTINGS`
3. Zmodyfikuj wartości:
   - `LR_jpeg_quality` - jakość JPEG (0.0 - 1.0)
   - `LR_size_maxWidth/maxHeight` - maksymalny rozmiar w pikselach
   - `LR_outputSharpeningLevel` - poziom wyostrzania (1=Low, 2=Standard, 3=High)

## Upload do Galeria Online

Po eksporcie możesz przeciągnąć foldery albumów bezpośrednio do przeglądarki:

1. Otwórz [https://lenaparty.pl/admin](https://lenaparty.pl/admin)
2. Kliknij **Nowy Upload**
3. Przeciągnij folder albumu (zawierający `light/` i `max/`)
4. Backend automatycznie rozpozna strukturę

## Rozwiązywanie problemów

### Plugin nie pojawia się w menu
- Upewnij się, że plugin jest włączony w **Plug-in Manager**
- Sprawdź czy folder ma rozszerzenie `.lrdevplugin` lub `.lrplugin`

### Błąd "Nie znaleziono kolekcji"
- Upewnij się, że zaznaczono Collection Set lub kolekcję (nie Smart Collection)
- Kliknij bezpośrednio na nazwę kolekcji/setu w panelu Collections

### Eksport trwa długo
- To normalne przy dużej liczbie zdjęć
- Każde zdjęcie jest eksportowane 2x (light + max)
- Możesz anulować eksport w pasku postępu

## Licencja

MIT License - używaj dowolnie.
